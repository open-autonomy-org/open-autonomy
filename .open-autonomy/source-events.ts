// App-owned cache and acknowledgement of the public native workflow stream.
// No board database, internal package path or periodic board read belongs here.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export class BoardEventSource {
  cards = new Map<string, any>();
  private cursor?: string;
  private child?: ChildProcess;
  private closed = false;
  private ready!: () => void;
  private refuse?: (error: Error) => void;
  private stopped = new Error('Workflow source stopped before acknowledgement');
  private pendingSnapshot?: Map<string, any>;
  private following?: Promise<void>;
  constructor(private options: {command: string[]; stateFile: string; env: Record<string,string>; changed: () => Promise<void>; log: (message:string)=>void}) {
    if(existsSync(options.stateFile)){
      const saved=JSON.parse(readFileSync(options.stateFile,'utf8'));
      if(saved.version===1){this.cursor=saved.cursor;this.cards=new Map(saved.cards??[]);}
    }
  }
  start(): Promise<void> {
    const ready=new Promise<void>((resolve,reject)=>{this.ready=resolve;this.refuse=reject;});
    this.following=this.follow();void this.following.catch(error=>{this.refuse?.(error);this.options.log(`event source stopped: ${(error as Error).message}`);});return ready;
  }
  close(reason=this.stopped): void {if(this.closed)return;this.closed=true;this.stopped=reason;this.refuse?.(reason);if(this.child?.exitCode===null&&this.child.signalCode===null)this.child.kill('SIGTERM');}
  async stop(): Promise<void> {this.close();await this.following;}
  private save(): void {
    const temporary=`${this.options.stateFile}.${process.pid}.tmp`;
    writeFileSync(temporary,JSON.stringify({version:1,cursor:this.cursor,cards:[...this.cards]})+'\n',{mode:0o600});
    renameSync(temporary,this.options.stateFile);
  }
  private async publish(): Promise<void> {
    while(!this.closed){
      try{await this.options.changed();if(this.closed)throw this.stopped;return;}
      catch(error){if(this.closed)throw error;this.options.log(`event delivery pending: ${(error as Error).message}`);await Bun.sleep(5000);}
    }
    throw new Error('Publisher stopped before acknowledgement');
  }
  private async follow(): Promise<void> {
    while(!this.closed){
      const command=[...this.options.command,...(this.cursor?['--after',this.cursor]:[])];
      const child=spawn(command[0],command.slice(1),{env:this.options.env,stdio:['ignore','pipe','inherit']});this.child=child;
      let failure: Error|undefined;
      const exited=new Promise<void>((resolve,reject)=>{child.once('error',error=>{failure=error;this.options.log(`event source unavailable: ${error.message}`);});child.once('close',()=>failure?reject(failure):resolve());});
      void exited.catch(()=>{});
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
      finally{this.pendingSnapshot=undefined;lines.close();child.stdout?.resume();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;this.child=undefined;}
      if(!this.closed)await Bun.sleep(5000); // reconnect retained changes; never reload all cards
    }
  }
}
