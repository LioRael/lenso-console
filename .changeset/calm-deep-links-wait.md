---
"@lenso/console-web": patch
---

Keep direct Module Surface links in a loading or unavailable state until the connected System's Managed Service Context has been resolved. Console now defers loading the surface artifact until that authority context is known.

Publish the Console Service image for both AMD64 and ARM64 so local development can use the native architecture instead of emulation.
