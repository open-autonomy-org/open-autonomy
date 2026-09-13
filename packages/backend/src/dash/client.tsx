/** @jsxImportSource preact */
// The browser's half: the same tree over the data the worker rendered it from, so a live session's turns can land.
import { hydrate } from 'preact';
import { DashApp } from './app.js';
import type { DashData } from './model.js';

const data = document.getElementById('dash-data');
const root = document.getElementById('dash');
if (data && root) hydrate(<DashApp d={JSON.parse(data.textContent ?? '{}') as DashData} />, root);
