// src/lib/get-wp-image.js
import md5 from "blueimp-md5";

/**
 * Transforms a remote WordPress URL into the local /img-cache/ path
 * Matches the logic in src/scripts/sync-flex-rest.js
 */
export function getWpImage(url) {
  if (!url || typeof url !== "string") return null;
  
  // If it's already a local path, return as-is
  if (url.startsWith("/")) return url;

  try {
    let processUrl = url;

    // 1. STRIP .webp if it is a double extension (e.g. image.jpg.webp)
    if (processUrl.toLowerCase().endsWith('.webp')) {
      const withoutWebp = processUrl.slice(0, -5); 
      // Check if the previous extension is valid image format
      const extBefore = withoutWebp.slice(withoutWebp.lastIndexOf('.'));
      if (['.jpg', '.jpeg', '.png'].includes(extBefore.toLowerCase())) {
          processUrl = withoutWebp;
      }
    }

    // 2. Generate Hash from CLEANED URL (slice to 8 chars)
    const hash = md5(processUrl).slice(0, 8);
    
    // 3. Extract parts manually (No Node 'path' module)
    //    We use the URL API to safely get the pathname, then string methods
    const urlObj = new URL(processUrl);
    const pathname = urlObj.pathname;
    const basename = pathname.substring(pathname.lastIndexOf('/') + 1);
    const lastDotIndex = basename.lastIndexOf('.');
    
    const ext = lastDotIndex !== -1 ? basename.substring(lastDotIndex) : '';
    const nameWithoutExt = lastDotIndex !== -1 ? basename.substring(0, lastDotIndex) : basename;

    // 4. Sanitize
    const cleanName = nameWithoutExt.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();

    // 5. Append .webp to jpg/png
    let finalExt = ext;
    if (['.jpg', '.jpeg', '.png'].includes(ext.toLowerCase())) {
        finalExt = `${ext}.webp`;
    }

    // 6. Return local path
    return `/img-cache/${cleanName}-${hash}${finalExt}`;

  } catch (err) {
    console.warn("[getWpImage] Failed to transform URL:", url);
    return url;
  }
}