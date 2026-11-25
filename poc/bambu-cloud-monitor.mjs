// Composition POC : la session cloud et ses commandes signées est canonique dans le connecteur TypeScript.
import { createCloudMonitor as createMonitor } from '../connectors/bambu/src/cloud-monitor.ts';
import { reportedControls } from './manual-controls.mjs';
import { bambuFilaments } from './filaments.mjs';

export function createCloudMonitor(options) {
  return createMonitor({ ...options, reportedControls, bambuFilaments });
}
