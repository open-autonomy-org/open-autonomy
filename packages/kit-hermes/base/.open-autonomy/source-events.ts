// App-owned cache and acknowledgement of the public native workflow stream.
// No board database, internal package path or periodic board read belongs here.
// Cache identities are <board>:<card.id>; a retained frame cursor is a source position,
// not an OA event ID or transcript offset. Snapshot inventory replaces the cache at
// snapshot_end; removed cards disappear without a fabricated completion. Source resync
// clears the cursor and asks for a new snapshot. Cards and cursor are saved together
// after changed() resolves; callback rejection retries without advancing that cursor.
// The caller can handle some effects separately (publisher.ts retries session failures),
// so this acknowledgement covers the callback, not every OA publication or native stream.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export class BoardEventSource {
  cards = new Map<string, any>();
  private cursor?: string;
  private child?: ChildProcess;
  private closed = false;
  private ready!: () => void;
  private pendingSnapshot?: Map<string, any>;
  constructor(private options: {command: string[]; stateFile: string; env: Record<string,string>; changed: () => Promise<void>; log: (message:string)=>void}) {
    if(existsSync(options.stateFile)){
      const saved=JSON.parse(readFileSync(options.stateFile,'utf8'));
      if(saved.version===1){this.cursor=saved.cursor;this.cards=new Map(saved.cards??[]);}
    }
  }
  start(): Promise<void> {
    const ready=new Promise<void>(resolve=>{this.ready=resolve;});
    void this.follow();return ready;
  }
  close(): void {this.closed=true;this.child?.kill('SIGTERM');}
  private save(): void {
    const temporary=`${this.options.stateFile}.${process.pid}.tmp`;
    writeFileSync(temporary,JSON.stringify({version:1,cursor:this.cursor,cards:[...this.cards]})+'\n',{mode:0o600});
    renameSync(temporary,this.options.stateFile);
  }
  private async publish(): Promise<void> {
    while(!this.closed){
      try{await this.options.changed();return;}
      catch(error){this.options.log(`event delivery pending: ${(error as Error).message}`);await Bun.sleep(5000);}
    }
    throw new Error('Publisher stopped before acknowledgement');
  }
  private async follow(): Promise<void> {
    while(!this.closed){
      const command=[...this.options.command,...(this.cursor?['--after',this.cursor]:[])];
      const child=spawn(command[0],command.slice(1),{env:this.options.env,stdio:['ignore','pipe','inherit']});this.child=child;
      const exited=new Promise<void>(resolve=>{child.once('error',error=>{this.options.log(`event source unavailable: ${error.message}`);resolve();});child.once('exit',()=>resolve());});
      const lines=createInterface({input:child.stdout!});
      try{
        for await(const line of lines){
          if(this.closed)break;
          lines.pause();
          const frame=JSON.parse(line);
          if(frame.type==='resync_required'){this.cursor=undefined;this.save();this.options.log(`event source requests snapshot: ${frame.reason}`);break;}
          if(frame.type==='snapshot_begin')this.pendingSnapshot=new Map();
          if(frame.type==='snapshot_item'||frame.type==='event'){
            const {board,card}=frame.data,key=`${board}:${card.id}`;
            const cards=this.pendingSnapshot??this.cards;
            if(card.removed)cards.delete(key);else cards.set(key,{...card,board});
            if(frame.type==='event'){await this.publish();this.cursor=frame.cursor;this.save();}
          }
          if(frame.type==='snapshot_end'){
            if(!this.pendingSnapshot)throw new Error('Snapshot ended without its inventory');
            this.cards=this.pendingSnapshot;this.pendingSnapshot=undefined;
            await this.publish();this.cursor=frame.cursor;this.save();this.ready();
          }
          if(frame.type==='checkpoint'){await this.publish();this.cursor=frame.cursor;this.save();this.ready();}
          lines.resume();
        }
      }catch(error){if(!this.closed)this.options.log(`event source interrupted: ${(error as Error).message}`);}
      finally{this.pendingSnapshot=undefined;lines.close();child.kill('SIGTERM');await exited;this.child=undefined;}
      if(!this.closed)await Bun.sleep(5000); // reconnect retained changes; never reload all cards
    }
  }
}
