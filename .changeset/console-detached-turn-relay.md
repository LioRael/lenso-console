---
"@lenso/console-web": patch
---

Keep supervised Agent turns progressing when a browser stops reading its response.
Slow readers now receive a stream error and can recover from Agent history;
upstream failures are no longer presented as a successful end of stream.
