// Projection diagnostics injectée par composition ; aucun protocole dans le POC.
import { createXToolCamera } from '../connectors/xtool/src/camera.ts';
import { observeImages } from './diagnostics.mjs';

export const { snapshotXToolCamera, streamXToolCamera } = createXToolCamera({ observeImages });
