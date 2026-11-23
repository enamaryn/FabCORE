#!/usr/bin/env node
import { ensureWebBuild } from '../src/http/web-build.ts';
await ensureWebBuild();
console.log('Interface FabCore compilée.');
