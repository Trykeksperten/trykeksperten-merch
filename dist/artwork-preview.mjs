import {loadFile} from './storage.mjs';
import {createVectorPreview} from './vector-preview.mjs?v=2';
import {createArtworkPreviewLoader} from './artwork-preview-loader.mjs';
// A cart contains server-validated design data, which may omit browser-only preview IDs.
export const loadArtworkPreview=createArtworkPreviewLoader({loadFile,createVectorPreview});
