/* Generated from Console-owned utility call sites during the StyleX migration. */
/* eslint-disable curly, func-style, no-inline-comments, require-unicode-regexp, sort-keys */
import * as stylex from "@stylexjs/stylex";

const utilityStyles = stylex.create({
  u0: { pointerEvents: "none" }, // pointer-events-none
  u1: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: "0",
  }, // sr-only
  u2: { position: "absolute" }, // absolute
  u3: { position: "fixed" }, // fixed
  u4: { position: "relative" }, // relative
  u5: { inset: "calc(0.25rem * 0)" }, // inset-0
  u6: { inset: "calc(0.25rem * 1)" }, // inset-1
  u7: { top: "calc(0.25rem * -1)" }, // -top-1
  u8: { top: "calc(0.25rem * -3.5)" }, // -top-3.5
  u9: { top: "calc(0.25rem * 0)" }, // top-0
  u10: { top: "calc(0.25rem * 1)" }, // top-1
  u11: { top: "calc(0.25rem * 2)" }, // top-2
  u12: { top: "calc(0.25rem * 6)" }, // top-6
  u13: { top: "calc(0.25rem * 9)" }, // top-9
  u14: { top: "calc(0.25rem * 11)" }, // top-11
  u15: { top: "calc(0.25rem * 12)" }, // top-12
  u16: { top: "5.5px" }, // top-[5.5px]
  u17: { top: "7.5px" }, // top-[7.5px]
  u18: { top: "10px" }, // top-[10px]
  u19: { top: "12px" }, // top-[12px]
  u20: { top: "12vh" }, // top-[12vh]
  u21: { top: "22px" }, // top-[22px]
  u22: { top: "37px" }, // top-[37px]
  u23: { top: "60px" }, // top-[60px]
  u24: { top: "100%" }, // top-full
  u25: { right: "calc(0.25rem * -1)" }, // -right-1
  u26: { right: "calc(0.25rem * 0)" }, // right-0
  u27: { right: "calc(0.25rem * 0.5)" }, // right-0.5
  u28: { right: "calc(0.25rem * 3)" }, // right-3
  u29: { right: "calc(0.25rem * 4)" }, // right-4
  u30: { right: "calc(0.25rem * 7)" }, // right-7
  u31: { bottom: "calc(0.25rem * 0.5)" }, // bottom-0.5
  u32: { bottom: "calc(0.25rem * 2)" }, // bottom-2
  u33: { bottom: "calc(0.25rem * 3)" }, // bottom-3
  u34: { bottom: "calc(0.25rem * 10)" }, // bottom-10
  u35: { bottom: "-0.5rem" }, // bottom-[-0.5rem]
  u36: { left: "calc(0.25rem * 0)" }, // left-0
  u37: { left: "calc(1 / 2 * 100%)" }, // left-1/2
  u38: { left: "calc(0.25rem * 2)" }, // left-2
  u39: { left: "calc(0.25rem * 3)" }, // left-3
  u40: { left: "calc(0.25rem * 4)" }, // left-4
  u41: { left: "calc(0.25rem * 6)" }, // left-6
  u42: { left: "calc(0.25rem * 7)" }, // left-7
  u43: { left: "344px" }, // left-[344px]
  u44: { isolation: "isolate" }, // isolate
  u45: { zIndex: "0" }, // z-0
  u46: { zIndex: "2" }, // z-2
  u47: { zIndex: "3" }, // z-3
  u48: { zIndex: "10" }, // z-10
  u49: { zIndex: "30" }, // z-30
  u50: { zIndex: "50" }, // z-50
  u51: { zIndex: "60" }, // z-[60]
  u52: { zIndex: "70" }, // z-[70]
  u53: { marginInline: "calc(0.25rem * 3)" }, // mx-3
  u54: { marginInline: "auto" }, // mx-auto
  u55: { marginTop: "calc(0.25rem * 0.5)" }, // mt-0.5
  u56: { marginTop: "calc(0.25rem * 1)" }, // mt-1
  u57: { marginTop: "calc(0.25rem * 1.5)" }, // mt-1.5
  u58: { marginTop: "calc(0.25rem * 2)" }, // mt-2
  u59: { marginTop: "calc(0.25rem * 3)" }, // mt-3
  u60: { marginTop: "2px" }, // mt-[2px]
  u61: { marginTop: "3px" }, // mt-[3px]
  u62: { marginRight: "calc(0.25rem * 1)" }, // mr-1
  u63: { marginBottom: "calc(0.25rem * 1)" }, // mb-1
  u64: { marginBottom: "calc(0.25rem * 2)" }, // mb-2
  u65: { marginBottom: "calc(0.25rem * 3)" }, // mb-3
  u66: { marginLeft: "calc(0.25rem * 2)" }, // ml-2
  u67: { marginLeft: "auto" }, // ml-auto
  u68: {
    overflow: "hidden",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: "2",
  }, // line-clamp-2
  u69: { display: "block" }, // block
  u70: { display: "contents" }, // contents
  u71: { display: "flex" }, // flex
  u72: { display: "grid" }, // grid
  u73: { display: "none" }, // hidden
  u74: { display: "inline-flex" }, // inline-flex
  u75: { display: "table" }, // table
  u76: { width: "calc(0.25rem * 1.5)", height: "calc(0.25rem * 1.5)" }, // size-1.5
  u77: { width: "calc(0.25rem * 2)", height: "calc(0.25rem * 2)" }, // size-2
  u78: { width: "calc(0.25rem * 2.5)", height: "calc(0.25rem * 2.5)" }, // size-2.5
  u79: { width: "calc(0.25rem * 3)", height: "calc(0.25rem * 3)" }, // size-3
  u80: { width: "calc(0.25rem * 4)", height: "calc(0.25rem * 4)" }, // size-4
  u81: { width: "calc(0.25rem * 4.5)", height: "calc(0.25rem * 4.5)" }, // size-4.5
  u82: { width: "calc(0.25rem * 7)", height: "calc(0.25rem * 7)" }, // size-7
  u83: { width: "calc(0.25rem * 8)", height: "calc(0.25rem * 8)" }, // size-8
  u84: { width: "2px", height: "2px" }, // size-[2px]
  u85: { width: "6px", height: "6px" }, // size-[6px]
  u86: { width: "7px", height: "7px" }, // size-[7px]
  u87: { width: "13px", height: "13px" }, // size-[13px]
  u88: { width: "100%", height: "100%" }, // size-full
  u89: { height: "calc(0.25rem * 0.5)" }, // h-0.5
  u90: { height: "calc(0.25rem * 0.75)" }, // h-0.75
  u91: { height: "calc(0.25rem * 1.5)" }, // h-1.5
  u92: { height: "calc(0.25rem * 2)" }, // h-2
  u93: { height: "calc(0.25rem * 3)" }, // h-3
  u94: { height: "calc(0.25rem * 3.5)" }, // h-3.5
  u95: { height: "calc(0.25rem * 4)" }, // h-4
  u96: { height: "calc(0.25rem * 5)" }, // h-5
  u97: { height: "calc(0.25rem * 6)" }, // h-6
  u98: { height: "calc(0.25rem * 7)" }, // h-7
  u99: { height: "calc(0.25rem * 8)" }, // h-8
  u100: { height: "calc(0.25rem * 9)" }, // h-9
  u101: { height: "calc(0.25rem * 10)" }, // h-10
  u102: { height: "calc(0.25rem * 11)" }, // h-11
  u103: { height: "calc(0.25rem * 12)" }, // h-12
  u104: { height: "calc(0.25rem * 25)" }, // h-25
  u105: { height: "14px" }, // h-[14px]
  u106: { height: "18px" }, // h-[18px]
  u107: { height: "20px" }, // h-[20px]
  u108: { height: "22px" }, // h-[22px]
  u109: { height: "25px" }, // h-[25px]
  u110: { height: "26px" }, // h-[26px]
  u111: { height: "27px" }, // h-[27px]
  u112: { height: "30px" }, // h-[30px]
  u113: { height: "32px" }, // h-[32px]
  u114: { height: "34px" }, // h-[34px]
  u115: { height: "37px" }, // h-[37px]
  u116: { height: "38px" }, // h-[38px]
  u117: { height: "42px" }, // h-[42px]
  u118: { height: "44px" }, // h-[44px]
  u119: { height: "48px" }, // h-[48px]
  u120: { height: "49px" }, // h-[49px]
  u121: { height: "52px" }, // h-[52px]
  u122: { height: "58px" }, // h-[58px]
  u123: { height: "60px" }, // h-[60px]
  u124: { height: "64px" }, // h-[64px]
  u125: { height: "68px" }, // h-[68px]
  u126: { height: "72px" }, // h-[72px]
  u127: { height: "74px" }, // h-[74px]
  u128: { height: "80px" }, // h-[80px]
  u129: { height: "84px" }, // h-[84px]
  u130: { height: "88px" }, // h-[88px]
  u131: { height: "98px" }, // h-[98px]
  u132: { height: "100px" }, // h-[100px]
  u133: { height: "104px" }, // h-[104px]
  u134: { height: "108px" }, // h-[108px]
  u135: { height: "112px" }, // h-[112px]
  u136: { height: "122px" }, // h-[122px]
  u137: { height: "132px" }, // h-[132px]
  u138: { height: "210px" }, // h-[210px]
  u139: { height: "216px" }, // h-[216px]
  u140: { height: "256px" }, // h-[256px]
  u141: { height: "278px" }, // h-[278px]
  u142: { height: "348px" }, // h-[348px]
  u143: { height: "618px" }, // h-[618px]
  u144: { height: "min(560px, calc(100vh - 72px))" }, // h-[min(560px,calc(100vh-72px))]
  u145: { height: "100%" }, // h-full
  u146: { height: "1px" }, // h-px
  u147: { maxHeight: "calc(0.25rem * 48)" }, // max-h-48
  u148: { maxHeight: "calc(0.25rem * 52)" }, // max-h-52
  u149: { maxHeight: "150px" }, // max-h-[150px]
  u150: { maxHeight: "171px" }, // max-h-[171px]
  u151: { maxHeight: "320px" }, // max-h-[320px]
  u152: { minHeight: "calc(0.25rem * 0)" }, // min-h-0
  u153: { minHeight: "calc(0.25rem * 5)" }, // min-h-5
  u154: { minHeight: "calc(0.25rem * 5.75)" }, // min-h-5.75
  u155: { minHeight: "calc(0.25rem * 6)" }, // min-h-6
  u156: { minHeight: "calc(0.25rem * 9)" }, // min-h-9
  u157: { minHeight: "69px" }, // min-h-[69px]
  u158: { minHeight: "100%" }, // min-h-full
  u159: { width: "calc(0.25rem * 2)" }, // w-2
  u160: { width: "calc(0.25rem * 3)" }, // w-3
  u161: { width: "calc(3 / 4 * 100%)" }, // w-3/4
  u162: { width: "calc(5 / 6 * 100%)" }, // w-5/6
  u163: { width: "calc(0.25rem * 10)" }, // w-10
  u164: { width: "calc(0.25rem * 12)" }, // w-12
  u165: { width: "calc(0.25rem * 14)" }, // w-14
  u166: { width: "calc(0.25rem * 20)" }, // w-20
  u167: { width: "calc(0.25rem * 24)" }, // w-24
  u168: { width: "calc(0.25rem * 28)" }, // w-28
  u169: { width: "calc(0.25rem * 35)" }, // w-35
  u170: { width: "7px" }, // w-[7px]
  u171: { width: "13px" }, // w-[13px]
  u172: { width: "48px" }, // w-[48px]
  u173: { width: "49px" }, // w-[49px]
  u174: { width: "58px" }, // w-[58px]
  u175: { width: "68px" }, // w-[68px]
  u176: { width: "80px" }, // w-[80px]
  u177: { width: "92px" }, // w-[92px]
  u178: { width: "97px" }, // w-[97px]
  u179: { width: "120px" }, // w-[120px]
  u180: { width: "150px" }, // w-[150px]
  u181: { width: "220px" }, // w-[220px]
  u182: { width: "256px" }, // w-[256px]
  u183: { width: "260px" }, // w-[260px]
  u184: { width: "280px" }, // w-[280px]
  u185: { width: "284px" }, // w-[284px]
  u186: { width: "332px" }, // w-[332px]
  u187: { width: "min(520px, calc(100% - 32px))" }, // w-[min(520px,calc(100%-32px))]
  u188: { width: "min(620px, calc(100vw - 64px))" }, // w-[min(620px,calc(100vw-64px))]
  u189: { width: "min(760px, calc(100vw - 40px))" }, // w-[min(760px,calc(100vw-40px))]
  u190: { width: "fit-content" }, // w-fit
  u191: { width: "100%" }, // w-full
  u192: { width: "max-content" }, // w-max
  u193: { width: "1px" }, // w-px
  u194: { maxWidth: "var(--container-5xl, 64rem)" }, // max-w-5xl
  u195: { maxWidth: "calc(0.25rem * 14)" }, // max-w-14
  u196: { maxWidth: "calc(0.25rem * 16)" }, // max-w-16
  u197: { maxWidth: "calc(0.25rem * 18)" }, // max-w-18
  u198: { maxWidth: "calc(0.25rem * 22)" }, // max-w-22
  u199: { maxWidth: "530px" }, // max-w-[530px]
  u200: { maxWidth: "100%" }, // max-w-full
  u201: { minWidth: "calc(0.25rem * 0)" }, // min-w-0
  u202: { minWidth: "calc(0.25rem * 0.75)" }, // min-w-0.75
  u203: { minWidth: "calc(0.25rem * 1)" }, // min-w-1
  u204: { minWidth: "calc(0.25rem * 2)" }, // min-w-2
  u205: { minWidth: "calc(0.25rem * 4.5)" }, // min-w-4.5
  u206: { minWidth: "calc(0.25rem * 5)" }, // min-w-5
  u207: { minWidth: "600px" }, // min-w-[600px]
  u208: { minWidth: "100%" }, // min-w-full
  u209: { flex: "1" }, // flex-1
  u210: { flexShrink: "0" }, // shrink-0
  u211: { transform: "translateX(calc(50% * -1))" }, // -translate-x-1/2
  u212: { transform: "translateX(calc(100% * -1))" }, // -translate-x-full
  u213: { cursor: "grab" }, // cursor-grab
  u214: { cursor: "grabbing" }, // cursor-grabbing
  u215: { cursor: "pointer" }, // cursor-pointer
  u216: { scrollbarWidth: "thin" }, // [scrollbar-width:thin]
  u217: { scrollbarWidth: "none" }, // scrollbar-none
  u218: { listStyleType: "none" }, // list-none
  u219: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }, // grid-cols-3
  u220: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }, // grid-cols-4
  u221: { gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }, // grid-cols-5
  u222: {
    gridTemplateColumns: "8px 94px 46px 56px 56px 56px 38px minmax(96px,1fr)",
  }, // grid-cols-[8px_94px_46px_56px_56px_56px_38px_minmax(96px,1fr)]
  u223: { gridTemplateColumns: "8px minmax(0,1fr)" }, // grid-cols-[8px_minmax(0,1fr)]
  u224: { gridTemplateColumns: "40px minmax(0,1fr)" }, // grid-cols-[40px_minmax(0,1fr)]
  u225: { gridTemplateColumns: "80px minmax(0,1fr)" }, // grid-cols-[80px_minmax(0,1fr)]
  u226: { gridTemplateColumns: "86px minmax(0,1fr)" }, // grid-cols-[86px_minmax(0,1fr)]
  u227: { gridTemplateColumns: "90px minmax(0,1fr)" }, // grid-cols-[90px_minmax(0,1fr)]
  u228: { gridTemplateColumns: "92px minmax(0,1fr)" }, // grid-cols-[92px_minmax(0,1fr)]
  u229: { gridTemplateColumns: "96px minmax(0,1fr) minmax(120px,0.7fr)" }, // grid-cols-[96px_minmax(0,1fr)_minmax(120px,0.7fr)]
  u230: { gridTemplateColumns: "96px minmax(0,1fr) minmax(140px,0.7fr)" }, // grid-cols-[96px_minmax(0,1fr)_minmax(140px,0.7fr)]
  u231: { gridTemplateColumns: "110px minmax(0,1fr)" }, // grid-cols-[110px_minmax(0,1fr)]
  u232: { gridTemplateColumns: "120px minmax(0,1fr)" }, // grid-cols-[120px_minmax(0,1fr)]
  u233: { gridTemplateColumns: "150px minmax(0,1fr)" }, // grid-cols-[150px_minmax(0,1fr)]
  u234: { gridTemplateColumns: "260px 8px minmax(0,1fr)" }, // grid-cols-[260px_8px_minmax(0,1fr)]
  u235: { gridTemplateColumns: "332px 232px" }, // grid-cols-[332px_232px]
  u236: { gridTemplateColumns: "auto minmax(0,1fr)" }, // grid-cols-[auto_minmax(0,1fr)]
  u237: { gridTemplateColumns: "minmax(0,1fr) 376px" }, // grid-cols-[minmax(0,1fr)_376px]
  u238: { gridTemplateColumns: "minmax(0,1fr) auto" }, // grid-cols-[minmax(0,1fr)_auto]
  u239: { gridTemplateColumns: "minmax(140px,0.5fr) minmax(0,1fr)" }, // grid-cols-[minmax(140px,0.5fr)_minmax(0,1fr)]
  u240: {
    gridTemplateColumns:
      "minmax(140px,0.6fr) minmax(0,1fr) minmax(140px,0.7fr)",
  }, // grid-cols-[minmax(140px,0.6fr)_minmax(0,1fr)_minmax(140px,0.7fr)]
  u241: { gridTemplateColumns: "minmax(180px,260px) minmax(0,1fr)" }, // grid-cols-[minmax(180px,260px)_minmax(0,1fr)]
  u242: { gridTemplateColumns: "repeat(20,minmax(0,1fr))" }, // grid-cols-[repeat(20,minmax(0,1fr))]
  u243: { gridTemplateRows: "38px minmax(0,1fr)" }, // grid-rows-[38px_minmax(0,1fr)]
  u244: { gridTemplateRows: "42px minmax(0,1fr)" }, // grid-rows-[42px_minmax(0,1fr)]
  u245: { gridTemplateRows: "60px 1px 40px 1px 26px 1px minmax(0,1fr)" }, // grid-rows-[60px_1px_40px_1px_26px_1px_minmax(0,1fr)]
  u246: { gridTemplateRows: "94px minmax(0,1fr)" }, // grid-rows-[94px_minmax(0,1fr)]
  u247: { gridTemplateRows: "auto auto auto minmax(0,1fr)" }, // grid-rows-[auto_auto_auto_minmax(0,1fr)]
  u248: { gridTemplateRows: "auto minmax(0,1fr)" }, // grid-rows-[auto_minmax(0,1fr)]
  u249: { flexDirection: "column" }, // flex-col
  u250: { flexWrap: "wrap" }, // flex-wrap
  u251: { placeItems: "center" }, // place-items-center
  u252: { alignContent: "flex-start" }, // content-start
  u253: { alignItems: "baseline" }, // items-baseline
  u254: { alignItems: "center" }, // items-center
  u255: { alignItems: "flex-start" }, // items-start
  u256: { justifyContent: "space-between" }, // justify-between
  u257: { justifyContent: "center" }, // justify-center
  u258: { justifyContent: "flex-end" }, // justify-end
  u259: { gap: "calc(0.25rem * 0)" }, // gap-0
  u260: { gap: "calc(0.25rem * 0.5)" }, // gap-0.5
  u261: { gap: "calc(0.25rem * 1)" }, // gap-1
  u262: { gap: "calc(0.25rem * 1.5)" }, // gap-1.5
  u263: { gap: "calc(0.25rem * 2)" }, // gap-2
  u264: { gap: "calc(0.25rem * 2.5)" }, // gap-2.5
  u265: { gap: "calc(0.25rem * 3)" }, // gap-3
  u266: { gap: "calc(0.25rem * 4)" }, // gap-4
  u267: { gap: "3px" }, // gap-[3px]
  u268: { gap: "5px" }, // gap-[5px]
  u269: { gap: "6px" }, // gap-[6px]
  u270: { gap: "7px" }, // gap-[7px]
  u271: { gap: "9px" }, // gap-[9px]
  u272: { gap: "14px" }, // gap-[14px]
  u273: { gap: "1px" }, // gap-px
  u274: { columnGap: "calc(0.25rem * 2)" }, // gap-x-2
  u275: { columnGap: "calc(0.25rem * 3.5)" }, // gap-x-3.5
  u276: { rowGap: "calc(0.25rem * 1.5)" }, // gap-y-1.5
  u277: { alignSelf: "center" }, // self-center
  u278: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, // truncate
  u279: { overflow: "auto" }, // overflow-auto
  u280: { overflow: "hidden" }, // overflow-hidden
  u281: { overflow: "visible" }, // overflow-visible
  u282: { overflowX: "auto" }, // overflow-x-auto
  u283: { overflowY: "hidden" }, // overflow-y-hidden
  u284: { borderRadius: "0.25rem" }, // rounded
  u285: { borderRadius: "1px" }, // rounded-[1px]
  u286: { borderRadius: "2px" }, // rounded-[2px]
  u287: { borderRadius: "4px" }, // rounded-[4px]
  u288: { borderRadius: "var(--radius-control)" }, // rounded-[var(--radius-control)]
  u289: { borderRadius: "var(--radius-overlay)" }, // rounded-[var(--radius-overlay)]
  u290: { borderRadius: "var(--radius-panel)" }, // rounded-[var(--radius-panel)]
  u291: { borderRadius: "var(--radius-popover)" }, // rounded-[var(--radius-popover)]
  u292: { borderRadius: "calc(infinity * 1px)" }, // rounded-full
  u293: { borderRadius: "var(--radius-sm, 0.25rem)" }, // rounded-sm
  u294: { borderRadius: "var(--radius-xs, 0.125rem)" }, // rounded-xs
  u295: {
    borderTopLeftRadius: "var(--radius-sm, 0.25rem)",
    borderTopRightRadius: "var(--radius-sm, 0.25rem)",
  }, // rounded-t-sm
  u296: { borderStyle: "solid", borderWidth: "1px" }, // border
  u297: { borderBlockWidth: "1px" }, // border-y
  u298: { borderTopWidth: "1px" }, // border-t
  u299: { borderRightWidth: "1px" }, // border-r
  u300: { borderBottomWidth: "1px" }, // border-b
  u301: { borderBottomWidth: "0px" }, // border-b-0
  u302: { borderLeftWidth: "1px" }, // border-l
  u303: { borderLeftWidth: "2px" }, // border-l-2
  u304: { borderColor: "var(--bg-canvas)" }, // border-(--bg-canvas)
  u305: { borderColor: "var(--bg-control)" }, // border-(--bg-control)
  u306: { borderColor: "var(--border-subtle)" }, // border-(--border-subtle)
  u307: { borderColor: "var(--danger)" }, // border-(--danger)
  u308: { borderColor: "var(--line)" }, // border-(--line)
  u309: { borderColor: "var(--line-subtle)" }, // border-(--line-subtle)
  u310: { borderColor: "color-mix(in srgb,var(--error) 30%,transparent)" }, // border-[color-mix(in_srgb,var(--error)_30%,transparent)]
  u311: { borderColor: "color-mix(in srgb,var(--warning) 28%,transparent)" }, // border-[color-mix(in_srgb,var(--warning)_28%,transparent)]
  u312: { borderColor: "color-mix(in srgb,var(--warning) 30%,transparent)" }, // border-[color-mix(in_srgb,var(--warning)_30%,transparent)]
  u313: { borderColor: "var(--error)" }, // border-[var(--error)]
  u314: { borderColor: "var(--tone-error-border)" }, // border-[var(--tone-error-border)]
  u315: { borderColor: "var(--tone-warning-border)" }, // border-[var(--tone-warning-border)]
  u316: { backgroundColor: "var(--background)" }, // bg-(--background)
  u317: { backgroundColor: "var(--bg-canvas)" }, // bg-(--bg-canvas)
  u318: {
    backgroundColor: "color-mix(in oklab, var(--bg-canvas) 80%, transparent)",
  }, // bg-(--bg-canvas)/80
  u319: { backgroundColor: "var(--bg-control)" }, // bg-(--bg-control)
  u320: { backgroundColor: "var(--bg-overlay)" }, // bg-(--bg-overlay)
  u321: { backgroundColor: "var(--bg-panel)" }, // bg-(--bg-panel)
  u322: { backgroundColor: "var(--bg-panel-header)" }, // bg-(--bg-panel-header)
  u323: { backgroundColor: "var(--bg-panel-muted)" }, // bg-(--bg-panel-muted)
  u324: { backgroundColor: "var(--bg-scrim)" }, // bg-(--bg-scrim)
  u325: { backgroundColor: "var(--bg-surface-muted)" }, // bg-(--bg-surface-muted)
  u326: { backgroundColor: "var(--border-subtle)" }, // bg-(--border-subtle)
  u327: { backgroundColor: "var(--elevated)" }, // bg-(--elevated)
  u328: { backgroundColor: "var(--fg-tertiary)" }, // bg-(--fg-tertiary)
  u329: { backgroundColor: "var(--line)" }, // bg-(--line)
  u330: { backgroundColor: "var(--line-subtle)" }, // bg-(--line-subtle)
  u331: { backgroundColor: "var(--sidebar)" }, // bg-(--sidebar)
  u332: { backgroundColor: "var(--surface)" }, // bg-(--surface)
  u333: {
    backgroundColor: "color-mix(in srgb,var(--bg-canvas) 84%,transparent)",
  }, // bg-[color-mix(in_srgb,var(--bg-canvas)_84%,transparent)]
  u334: {
    backgroundColor: "color-mix(in srgb,var(--bg-canvas) 90%,transparent)",
  }, // bg-[color-mix(in_srgb,var(--bg-canvas)_90%,transparent)]
  u335: {
    backgroundColor: "color-mix(in srgb,var(--bg-canvas) 92%,transparent)",
  }, // bg-[color-mix(in_srgb,var(--bg-canvas)_92%,transparent)]
  u336: { backgroundColor: "color-mix(in srgb,var(--error) 8%,transparent)" }, // bg-[color-mix(in_srgb,var(--error)_8%,transparent)]
  u337: { backgroundColor: "color-mix(in srgb,var(--warning) 9%,transparent)" }, // bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]
  u338: {
    backgroundColor: "color-mix(in srgb,var(--warning) 10%,transparent)",
  }, // bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]
  u339: { backgroundColor: "var(--error)" }, // bg-[var(--error)]
  u340: { backgroundColor: "var(--tone-warning-bg)" }, // bg-[var(--tone-warning-bg)]
  u341: { backgroundColor: "transparent" }, // bg-transparent
  u342: {
    backgroundImage:
      "linear-gradient(90deg,transparent 0%,transparent 24.8%,var(--line) 25%,transparent 25.2%,transparent 49.8%,var(--line) 50%,transparent 50.2%,transparent 74.8%,var(--line) 75%,transparent 75.2%)",
  }, // bg-[linear-gradient(90deg,transparent_0%,transparent_24.8%,var(--line)_25%,transparent_25.2%,transparent_49.8%,var(--line)_50%,transparent_50.2%,transparent_74.8%,var(--line)_75%,transparent_75.2%)]
  u343: { padding: "calc(0.25rem * 0)" }, // p-0
  u344: { padding: "calc(0.25rem * 2)" }, // p-2
  u345: { padding: "calc(0.25rem * 2.5)" }, // p-2.5
  u346: { padding: "calc(0.25rem * 3)" }, // p-3
  u347: { padding: "calc(0.25rem * 4)" }, // p-4
  u348: { paddingInline: "calc(0.25rem * 1)" }, // px-1
  u349: { paddingInline: "calc(0.25rem * 1.5)" }, // px-1.5
  u350: { paddingInline: "calc(0.25rem * 2)" }, // px-2
  u351: { paddingInline: "calc(0.25rem * 2.5)" }, // px-2.5
  u352: { paddingInline: "calc(0.25rem * 3)" }, // px-3
  u353: { paddingInline: "calc(0.25rem * 3.5)" }, // px-3.5
  u354: { paddingInline: "calc(0.25rem * 4)" }, // px-4
  u355: { paddingInline: "10px" }, // px-[10px]
  u356: { paddingBlock: "calc(0.25rem * 0)" }, // py-0
  u357: { paddingBlock: "calc(0.25rem * 0.5)" }, // py-0.5
  u358: { paddingBlock: "calc(0.25rem * 1)" }, // py-1
  u359: { paddingBlock: "calc(0.25rem * 1.5)" }, // py-1.5
  u360: { paddingBlock: "calc(0.25rem * 2)" }, // py-2
  u361: { paddingBlock: "calc(0.25rem * 2.5)" }, // py-2.5
  u362: { paddingBlock: "calc(0.25rem * 3)" }, // py-3
  u363: { paddingBlock: "7px" }, // py-[7px]
  u364: { paddingBlock: "14px" }, // py-[14px]
  u365: { paddingTop: "calc(0.25rem * 0)" }, // pt-0
  u366: { paddingTop: "calc(0.25rem * 1.5)" }, // pt-1.5
  u367: { paddingTop: "calc(0.25rem * 2.5)" }, // pt-2.5
  u368: { paddingTop: "calc(0.25rem * 3)" }, // pt-3
  u369: { paddingTop: "calc(0.25rem * 4)" }, // pt-4
  u370: { paddingTop: "calc(0.25rem * 7)" }, // pt-7
  u371: { paddingTop: "11px" }, // pt-[11px]
  u372: { paddingTop: "14px" }, // pt-[14px]
  u373: { paddingRight: "calc(0.25rem * 0)" }, // pr-0
  u374: { paddingRight: "calc(0.25rem * 7)" }, // pr-7
  u375: { paddingBottom: "calc(0.25rem * 1.5)" }, // pb-1.5
  u376: { paddingBottom: "calc(0.25rem * 2)" }, // pb-2
  u377: { paddingBottom: "calc(0.25rem * 2.5)" }, // pb-2.5
  u378: { paddingBottom: "9px" }, // pb-[9px]
  u379: { paddingBottom: "11px" }, // pb-[11px]
  u380: { paddingLeft: "calc(0.25rem * 2)" }, // pl-2
  u381: { paddingLeft: "calc(0.25rem * 7)" }, // pl-7
  u382: { textAlign: "center" }, // text-center
  u383: { textAlign: "left" }, // text-left
  u384: { textAlign: "right" }, // text-right
  u385: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  }, // font-mono
  u386: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  }, // font-sans
  u387: {
    fontSize: "var(--text-sm, 0.875rem)",
    lineHeight: "var(--text-sm--line-height, 1.25rem)",
  }, // text-sm
  u388: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  }, // text-xs
  u389: { fontSize: "7.5px" }, // text-[7.5px]
  u390: { fontSize: "8.5px" }, // text-[8.5px]
  u391: { fontSize: "8px" }, // text-[8px]
  u392: { fontSize: "9.5px" }, // text-[9.5px]
  u393: { fontSize: "9px" }, // text-[9px]
  u394: { fontSize: "10px" }, // text-[10px]
  u395: { fontSize: "11px" }, // text-[11px]
  u396: { fontSize: "12px" }, // text-[12px]
  u397: { fontSize: "13px" }, // text-[13px]
  u398: { fontSize: "14px" }, // text-[14px]
  u399: { fontSize: "15px" }, // text-[15px]
  u400: { fontSize: "16px" }, // text-[16px]
  u401: { lineHeight: "calc(0.25rem * 4)" }, // leading-4
  u402: { lineHeight: "calc(0.25rem * 5)" }, // leading-5
  u403: { lineHeight: "0" }, // leading-[0]
  u404: { lineHeight: "14px" }, // leading-[14px]
  u405: { lineHeight: "15px" }, // leading-[15px]
  u406: { lineHeight: "17px" }, // leading-[17px]
  u407: { lineHeight: "18px" }, // leading-[18px]
  u408: { lineHeight: "22px" }, // leading-[22px]
  u409: { lineHeight: "normal" }, // leading-[normal]
  u410: { lineHeight: "1" }, // leading-none
  u411: { lineHeight: "var(--leading-normal, 1.5)" }, // leading-normal
  u412: { fontWeight: "700" }, // font-bold
  u413: { fontWeight: "500" }, // font-medium
  u414: { fontWeight: "400" }, // font-normal
  u415: { fontWeight: "600" }, // font-semibold
  u416: { letterSpacing: "0.04em" }, // tracking-[0.04em]
  u417: { letterSpacing: "0.06em" }, // tracking-[0.06em]
  u418: { letterSpacing: "0.08em" }, // tracking-[0.08em]
  u419: { letterSpacing: "var(--tracking-tight, -0.025em)" }, // tracking-tight
  u420: { wordBreak: "break-all" }, // break-all
  u421: { textOverflow: "ellipsis" }, // text-ellipsis
  u422: { whiteSpace: "nowrap" }, // whitespace-nowrap
  u423: { whiteSpace: "pre-wrap" }, // whitespace-pre-wrap
  u424: { color: "var(--accent)" }, // text-(--accent)
  u425: { color: "var(--danger)" }, // text-(--danger)
  u426: { color: "var(--error)" }, // text-(--error)
  u427: { color: "var(--fg-primary)" }, // text-(--fg-primary)
  u428: { color: "var(--fg-quaternary)" }, // text-(--fg-quaternary)
  u429: { color: "var(--fg-secondary)" }, // text-(--fg-secondary)
  u430: { color: "var(--fg-tertiary)" }, // text-(--fg-tertiary)
  u431: { color: "var(--foreground)" }, // text-(--foreground)
  u432: { color: "var(--muted)" }, // text-(--muted)
  u433: { color: "var(--muted-deep)" }, // text-(--muted-deep)
  u434: { color: "var(--secondary)" }, // text-(--secondary)
  u435: { color: "var(--success)" }, // text-(--success)
  u436: { color: "var(--tone-error-fg)" }, // text-(--tone-error-fg)
  u437: { color: "var(--tone-success-fg)" }, // text-(--tone-success-fg)
  u438: { color: "var(--tone-warning-fg)" }, // text-(--tone-warning-fg)
  u439: { color: "var(--warning)" }, // text-(--warning)
  u440: { color: "color-mix(in srgb,var(--warning) 72%,var(--foreground))" }, // text-[color-mix(in_srgb,var(--warning)_72%,var(--foreground))]
  u441: { color: "var(--tone-error-fg)" }, // text-[var(--tone-error-fg)]
  u442: { textTransform: "capitalize" }, // capitalize
  u443: { textTransform: "none" }, // normal-case
  u444: { textTransform: "uppercase" }, // uppercase
  u445: { opacity: "0%" }, // opacity-0
  u446: { opacity: "90%" }, // opacity-90
  u447: { opacity: "0.65" }, // opacity-[0.65]
  u448: { boxShadow: "var(--elevation-control)" }, // shadow-(--elevation-control)
  u449: { boxShadow: "var(--elevation-overlay)" }, // shadow-(--elevation-overlay)
  u450: { boxShadow: "var(--elevation-panel)" }, // shadow-(--elevation-panel)
  u451: {
    outlineStyle: "none",
    outline: "2px solid transparent",
    outlineOffset: "2px",
  }, // outline-hidden
  u452: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  }, // transition
  u453: {
    transitionProperty: "all",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  }, // transition-all
  u454: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  }, // transition-colors
  u455: {
    transitionProperty: "opacity",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  }, // transition-opacity
  u456: { WebkitUserSelect: "none", userSelect: "none" }, // select-none
  u457: { ":first-child": { marginTop: "calc(0.25rem * 0)" } }, // first:mt-0
  u458: { ":first-child": { paddingLeft: "calc(0.25rem * 0)" } }, // first:pl-0
  u459: { ":last-child": { borderRightWidth: "0px" } }, // last:border-r-0
  u460: { ":last-child": { borderBottomWidth: "0px" } }, // last:border-b-0
  u461: { ":focus-within": { borderColor: "var(--accent)" } }, // focus-within:border-(--accent)
  u462: { ":focus-within": { backgroundColor: "var(--bg-control-hover)" } }, // focus-within:bg-(--bg-control-hover)
  u463: { ":hover": { borderColor: "var(--fg-quaternary)" } }, // hover:border-(--fg-quaternary)
  u464: { ":hover": { borderColor: "var(--line-strong)" } }, // hover:border-(--line-strong)
  u465: { ":hover": { backgroundColor: "var(--bg-control-hover)" } }, // hover:bg-(--bg-control-hover)
  u466: { ":hover": { backgroundColor: "var(--bg-row-hover)" } }, // hover:bg-(--bg-row-hover)
  u467: { ":hover": { backgroundColor: "var(--hover)" } }, // hover:bg-(--hover)
  u468: { ":hover": { color: "var(--fg-primary)" } }, // hover:text-(--fg-primary)
  u469: { ":hover": { color: "var(--foreground)" } }, // hover:text-(--foreground)
  u470: { ":focus-visible": { outlineStyle: "solid", outlineWidth: "2px" } }, // focus-visible:outline-2
  u471: { ":focus-visible": { outlineOffset: "1px" } }, // focus-visible:outline-offset-1
  u472: { ":focus-visible": { outlineOffset: "2px" } }, // focus-visible:outline-offset-2
  u473: { ":focus-visible": { outlineColor: "var(--focus-ring)" } }, // focus-visible:outline-(--focus-ring)
  u474: { ":disabled": { cursor: "default" } }, // disabled:cursor-default
  u475: { "@media (max-width: 1100px)": { display: "none" } }, // max-[1100px]:hidden
  u476: {
    "@media (max-width: 1279px)": {
      gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    },
  }, // max-xl:grid-cols-1
  u477: { "@media (max-width: 767px)": { display: "none" } }, // max-md:hidden
  u478: {
    "@media (max-width: 767px)": {
      gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    },
  }, // max-md:grid-cols-1
  u479: { "@media (max-width: 639px)": { top: "calc(0.25rem * 3)" } }, // max-sm:top-3
  u480: { "@media (max-width: 639px)": { marginTop: "calc(0.25rem * 1)" } }, // max-sm:mt-1
  u481: { "@media (max-width: 639px)": { display: "block" } }, // max-sm:block
  u482: { "@media (max-width: 639px)": { display: "none" } }, // max-sm:hidden
  u483: {
    "@media (max-width: 639px)": { height: "min(520px, calc(100vh - 24px))" },
  }, // max-sm:h-[min(520px,calc(100vh-24px))]
  u484: { "@media (max-width: 639px)": { width: "calc(100vw - 20px)" } }, // max-sm:w-[calc(100vw-20px)]
  u485: {
    "@media (min-width: 768px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  }, // md:grid-cols-2
  u486: {
    "@media (min-width: 768px)": {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    },
  }, // md:grid-cols-3
  u487: {
    "@media (min-width: 768px)": {
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    },
  }, // md:grid-cols-4
  u488: {
    "@media (min-width: 1024px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  }, // lg:grid-cols-2
  u489: { bottom: "-0.25rem" }, // -bottom-1
  u490: { bottom: "-0.375rem" }, // -bottom-1.5
  u491: { left: "-0.375rem" }, // -left-1.5
  u492: { right: "-0.375rem" }, // -right-1.5
  u493: { top: "-0.375rem" }, // -top-1.5
  u494: { gridTemplateColumns: "28px minmax(0,1fr) auto" }, // grid-cols-[28px_minmax(0,1fr)_auto]
  u495: {
    "@media (max-width: 639px)": {
      gridTemplateColumns: "28px minmax(0,1fr)",
    },
  }, // max-sm:grid-cols-[28px_minmax(0,1fr)]
  u496: { paddingBlockEnd: 0 }, // pb-0
  u497: { paddingBlockStart: "0.5rem" }, // pt-2
  u498: {
    ":focus-visible": { outlineOffset: "-2px" },
  }, // focus-visible:outline-offset-[-2px]
  u499: { ":hover": { backgroundColor: "var(--bg-control)" } }, // hover:bg-(--bg-control)
  u500: { ":hover": { borderColor: "var(--line)" } }, // hover:border-(--line)
  u501: { ":hover": { filter: "brightness(1.1)" } }, // hover:brightness-110
  u502: { ":hover": { color: "var(--error)" } }, // hover:text-(--error)
  u503: { "[data-active]": { borderColor: "var(--accent)" } }, // data-[active]:border-(--accent)
  u504: { "[data-active]": { borderBottomWidth: "1px" } }, // data-[active]:border-b
  u505: { "[data-active]": { fontWeight: "500" } }, // data-[active]:font-medium
  u506: { "[data-active]": { color: "var(--fg-primary)" } }, // data-[active]:text-(--fg-primary)
  u507: {
    "[data-starting-style]": { translate: "0 0.25rem" },
  }, // data-[starting-style]:translate-y-1
  u508: {
    "[data-starting-style]": { translate: "0.5rem 0" },
  }, // data-[starting-style]:translate-x-2
  u509: {
    "[data-starting-style]": { opacity: "0%" },
  }, // data-[starting-style]:opacity-0
  u510: {
    "::placeholder": { color: "var(--fg-quaternary)" },
  }, // placeholder:text-(--fg-quaternary)
  u511: { zIndex: "1" }, // z-1
  u512: { marginRight: "0.375rem" }, // mr-1.5
});

/*
 * A small second pass covers utility strings that live in shared class-name
 * constants or conditional branches rather than literal JSX attributes.
 * These remain compile-time StyleX declarations; unknown product and Module
 * classes continue through the compatibility path below.
 */
const fallbackStyles = stylex.create({
  bgAccent: { backgroundColor: "var(--accent)" },
  bgAccentMuted: { backgroundColor: "var(--accent-muted)" },
  bgAccentSoft: { backgroundColor: "var(--accent-soft)" },
  bgBgRowHover: { backgroundColor: "var(--bg-row-hover)" },
  bgBgRowSelected: { backgroundColor: "var(--bg-row-selected)" },
  bgBgSurface: { backgroundColor: "var(--bg-surface)" },
  bgDataAccent: { backgroundColor: "var(--data-accent)" },
  bgDataInfo: { backgroundColor: "var(--data-info)" },
  bgDataSuccess: { backgroundColor: "var(--data-success)" },
  bgError: { backgroundColor: "var(--error)" },
  bgFgPrimary: { backgroundColor: "var(--fg-primary)" },
  bgFgSecondary: { backgroundColor: "var(--fg-secondary)" },
  bgForeground: { backgroundColor: "var(--foreground)" },
  bgInfo: { backgroundColor: "var(--info)" },
  bgLineStrong: { backgroundColor: "var(--line-strong)" },
  bgSuccess: { backgroundColor: "var(--success)" },
  bgToneSuccessFg: { backgroundColor: "var(--tone-success-fg)" },
  bgToneWarningFg: { backgroundColor: "var(--tone-warning-fg)" },
  bgWarning: { backgroundColor: "var(--warning)" },
  bgErrorMuted: {
    backgroundColor: "color-mix(in srgb,var(--error) 10%,transparent)",
  },
  borderAccent: { borderColor: "var(--accent)" },
  borderErrorMuted: {
    borderColor: "color-mix(in srgb,var(--error) 45%,transparent)",
  },
  borderLineStrong: { borderColor: "var(--line-strong)" },
  borderDashed: { borderStyle: "dashed" },
  borderDouble: { borderStyle: "double" },
  borderTransparent: { borderColor: "transparent" },
  cursorDefault: { cursor: "default" },
  focusOutlineAccent: { ":focus-visible": { outlineColor: "var(--accent)" } },
  focusZOne: { ":focus-visible": { zIndex: "1" } },
  firstBorderTopZero: { ":first-child": { borderTopWidth: "0px" } },
  gridColsOne: { gridTemplateColumns: "repeat(1, minmax(0, 1fr))" },
  gridColsHeatmap: {
    gridTemplateColumns: "minmax(0,1fr) minmax(0,280px)",
  },
  gridColsInspector: {
    gridTemplateColumns: "60px 102px 62px minmax(0,1fr)",
  },
  hOne: { height: "calc(0.25rem * 1)" },
  hThirtyThree: { height: "33px" },
  hFiftySix: { height: "56px" },
  hViewportMinusSixteen: { height: "calc(100vh - 16px)" },
  insetXZero: { insetInline: "calc(0.25rem * 0)" },
  insetYZero: { insetBlock: "calc(0.25rem * 0)" },
  minHFourPointFive: { minHeight: "calc(0.25rem * 4.5)" },
  minHSixtySix: { minHeight: "66px" },
  opacityEightyTwo: { opacity: "82%" },
  opacityOneHundred: { opacity: "100%" },
  ringOne: { boxShadow: "0 0 0 1px currentColor" },
  ringLineStrong: { boxShadow: "0 0 0 1px var(--line-strong)" },
  rightTwo: { right: "calc(0.25rem * 2)" },
  shadowDefault: {
    boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  },
  shadowElevated: { boxShadow: "var(--elevation-raised)" },
  shadowFlame: { boxShadow: "0 0 0 1px var(--line-strong)" },
  shadowHeatmap: { boxShadow: "inset 2px 0 0 var(--accent)" },
  shadowRuntime: {
    boxShadow:
      "inset 0 0 0 1px color-mix(in srgb,var(--error) 20%,transparent),var(--elevation-raised)",
  },
  shadowWaterfall: { boxShadow: "inset 2px 0 0 #008545" },
  sizeOne: { width: "calc(0.25rem * 1)", height: "calc(0.25rem * 1)" },
  sizeFive: { width: "5px", height: "5px" },
  sizeNine: { width: "calc(0.25rem * 9)", height: "calc(0.25rem * 9)" },
  textWhite: { color: "white" },
  topHalf: { top: "50%" },
  topFive: { top: "5px" },
  trackingNormal: { letterSpacing: "0" },
  transitionFilter: {
    transitionDuration: "150ms",
    transitionProperty: "filter",
    transitionTimingFunction: "ease",
  },
  transitionDuration150: { transitionDuration: "150ms" },
  transitionDuration200: { transitionDuration: "200ms" },
  translateYNegativePx: { transform: "translateY(-1px)" },
  dataStartingTranslateYNegative: {
    "[data-starting-style]": { transform: "translate(-50%, -0.25rem)" },
  },
  scaleOnePoint004: { scale: "1.004" },
  wViewportMinusSixteen: { width: "min(540px, calc(100vw - 16px))" },
  wViewportMinusTwentyEight: { width: "min(560px, calc(100vw - 28px))" },
  wSeventyTwo: { width: "72px" },
  hoverBorderSecondary: { ":hover": { borderColor: "var(--fg-secondary)" } },
  hoverZOne: { ":hover": { zIndex: "1" } },
  zForty: { zIndex: "40" },
});

const fallbackStyleByClassName = {
  "bg-(--accent)": fallbackStyles.bgAccent,
  "bg-(--accent-muted)": fallbackStyles.bgAccentMuted,
  "bg-(--accent-soft)": fallbackStyles.bgAccentSoft,
  "bg-(--bg-row-hover)": fallbackStyles.bgBgRowHover,
  "bg-(--bg-row-selected)": fallbackStyles.bgBgRowSelected,
  "bg-(--bg-surface)": fallbackStyles.bgBgSurface,
  "bg-(--data-accent)": fallbackStyles.bgDataAccent,
  "bg-(--data-info)": fallbackStyles.bgDataInfo,
  "bg-(--data-success)": fallbackStyles.bgDataSuccess,
  "bg-(--error)": fallbackStyles.bgError,
  "bg-(--fg-primary)": fallbackStyles.bgFgPrimary,
  "bg-(--fg-secondary)": fallbackStyles.bgFgSecondary,
  "bg-(--foreground)": fallbackStyles.bgForeground,
  "bg-(--info)": fallbackStyles.bgInfo,
  "bg-(--line-strong)": fallbackStyles.bgLineStrong,
  "bg-(--success)": fallbackStyles.bgSuccess,
  "bg-(--tone-success-fg)": fallbackStyles.bgToneSuccessFg,
  "bg-(--tone-warning-fg)": fallbackStyles.bgToneWarningFg,
  "bg-(--warning)": fallbackStyles.bgWarning,
  "bg-[color-mix(in_srgb,var(--error)_10%,transparent)]":
    fallbackStyles.bgErrorMuted,
  "border-(--accent)": fallbackStyles.borderAccent,
  "border-[color-mix(in_srgb,var(--error)_45%,transparent)]":
    fallbackStyles.borderErrorMuted,
  "border-(--line-strong)": fallbackStyles.borderLineStrong,
  "border-dashed": fallbackStyles.borderDashed,
  "border-double": fallbackStyles.borderDouble,
  "border-transparent": fallbackStyles.borderTransparent,
  "cursor-default": fallbackStyles.cursorDefault,
  "focus-visible:outline-(--accent)": fallbackStyles.focusOutlineAccent,
  "focus-visible:z-1": fallbackStyles.focusZOne,
  "first:border-t-0": fallbackStyles.firstBorderTopZero,
  "grid-cols-1": fallbackStyles.gridColsOne,
  "grid-cols-[minmax(0,1fr)_minmax(0,280px)]": fallbackStyles.gridColsHeatmap,
  "grid-cols-[60px_102px_62px_minmax(0,1fr)]": fallbackStyles.gridColsInspector,
  "h-1": fallbackStyles.hOne,
  "h-[33px]": fallbackStyles.hThirtyThree,
  "h-[56px]": fallbackStyles.hFiftySix,
  "h-[calc(100vh-16px)]": fallbackStyles.hViewportMinusSixteen,
  "inset-x-0": fallbackStyles.insetXZero,
  "inset-y-0": fallbackStyles.insetYZero,
  "min-h-4.5": fallbackStyles.minHFourPointFive,
  "min-h-[66px]": fallbackStyles.minHSixtySix,
  "opacity-82": fallbackStyles.opacityEightyTwo,
  "opacity-100": fallbackStyles.opacityOneHundred,
  "ring-1": fallbackStyles.ringOne,
  "ring-(--line-strong)": fallbackStyles.ringLineStrong,
  "right-2": fallbackStyles.rightTwo,
  shadow: fallbackStyles.shadowDefault,
  "shadow-(--elevation-raised)": fallbackStyles.shadowElevated,
  "shadow-[0_0_0_1px_var(--line-strong)]": fallbackStyles.shadowFlame,
  "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--error)_20%,transparent),var(--elevation-raised)]":
    fallbackStyles.shadowRuntime,
  "shadow-[inset_2px_0_0_#008545]": fallbackStyles.shadowWaterfall,
  "shadow-[inset_2px_0_0_var(--accent)]": fallbackStyles.shadowHeatmap,
  "size-1": fallbackStyles.sizeOne,
  "size-[5px]": fallbackStyles.sizeFive,
  "size-9": fallbackStyles.sizeNine,
  "text-white": fallbackStyles.textWhite,
  "top-1/2": fallbackStyles.topHalf,
  "top-[5px]": fallbackStyles.topFive,
  "tracking-normal": fallbackStyles.trackingNormal,
  "transition-[filter]": fallbackStyles.transitionFilter,
  "duration-150": fallbackStyles.transitionDuration150,
  "duration-200": fallbackStyles.transitionDuration200,
  "-translate-y-px": fallbackStyles.translateYNegativePx,
  "data-[starting-style]:-translate-y-1":
    fallbackStyles.dataStartingTranslateYNegative,
  "scale-[1.004]": fallbackStyles.scaleOnePoint004,
  "w-[min(540px,calc(100vw-16px))]": fallbackStyles.wViewportMinusSixteen,
  "w-[min(560px,calc(100vw-28px))]": fallbackStyles.wViewportMinusTwentyEight,
  "w-[72px]": fallbackStyles.wSeventyTwo,
  "hover:border-(--fg-secondary)": fallbackStyles.hoverBorderSecondary,
  "hover:z-1": fallbackStyles.hoverZOne,
  "z-40": fallbackStyles.zForty,
} as Record<string, unknown>;

const utilityStyleByClassName = {
  "pointer-events-none": utilityStyles.u0,
  "sr-only": utilityStyles.u1,
  absolute: utilityStyles.u2,
  fixed: utilityStyles.u3,
  relative: utilityStyles.u4,
  "inset-0": utilityStyles.u5,
  "inset-1": utilityStyles.u6,
  "-top-1": utilityStyles.u7,
  "-top-3.5": utilityStyles.u8,
  "top-0": utilityStyles.u9,
  "top-1": utilityStyles.u10,
  "top-2": utilityStyles.u11,
  "top-6": utilityStyles.u12,
  "top-9": utilityStyles.u13,
  "top-11": utilityStyles.u14,
  "top-12": utilityStyles.u15,
  "top-[5.5px]": utilityStyles.u16,
  "top-[7.5px]": utilityStyles.u17,
  "top-[10px]": utilityStyles.u18,
  "top-[12px]": utilityStyles.u19,
  "top-[12vh]": utilityStyles.u20,
  "top-[22px]": utilityStyles.u21,
  "top-[37px]": utilityStyles.u22,
  "top-[60px]": utilityStyles.u23,
  "top-full": utilityStyles.u24,
  "-right-1": utilityStyles.u25,
  "right-0": utilityStyles.u26,
  "right-0.5": utilityStyles.u27,
  "right-3": utilityStyles.u28,
  "right-4": utilityStyles.u29,
  "right-7": utilityStyles.u30,
  "bottom-0.5": utilityStyles.u31,
  "bottom-2": utilityStyles.u32,
  "bottom-3": utilityStyles.u33,
  "bottom-10": utilityStyles.u34,
  "bottom-[-0.5rem]": utilityStyles.u35,
  "left-0": utilityStyles.u36,
  "left-1/2": utilityStyles.u37,
  "left-2": utilityStyles.u38,
  "left-3": utilityStyles.u39,
  "left-4": utilityStyles.u40,
  "left-6": utilityStyles.u41,
  "left-7": utilityStyles.u42,
  "left-[344px]": utilityStyles.u43,
  isolate: utilityStyles.u44,
  "z-0": utilityStyles.u45,
  "z-2": utilityStyles.u46,
  "z-3": utilityStyles.u47,
  "z-10": utilityStyles.u48,
  "z-30": utilityStyles.u49,
  "z-50": utilityStyles.u50,
  "z-[60]": utilityStyles.u51,
  "z-[70]": utilityStyles.u52,
  "mx-3": utilityStyles.u53,
  "mx-auto": utilityStyles.u54,
  "mt-0.5": utilityStyles.u55,
  "mt-1": utilityStyles.u56,
  "mt-1.5": utilityStyles.u57,
  "mt-2": utilityStyles.u58,
  "mt-3": utilityStyles.u59,
  "mt-[2px]": utilityStyles.u60,
  "mt-[3px]": utilityStyles.u61,
  "mr-1": utilityStyles.u62,
  "mb-1": utilityStyles.u63,
  "mb-2": utilityStyles.u64,
  "mb-3": utilityStyles.u65,
  "ml-2": utilityStyles.u66,
  "ml-auto": utilityStyles.u67,
  "line-clamp-2": utilityStyles.u68,
  block: utilityStyles.u69,
  contents: utilityStyles.u70,
  flex: utilityStyles.u71,
  grid: utilityStyles.u72,
  hidden: utilityStyles.u73,
  "inline-flex": utilityStyles.u74,
  table: utilityStyles.u75,
  "size-1.5": utilityStyles.u76,
  "size-2": utilityStyles.u77,
  "size-2.5": utilityStyles.u78,
  "size-3": utilityStyles.u79,
  "size-4": utilityStyles.u80,
  "size-4.5": utilityStyles.u81,
  "size-7": utilityStyles.u82,
  "size-8": utilityStyles.u83,
  "size-[2px]": utilityStyles.u84,
  "size-[6px]": utilityStyles.u85,
  "size-[7px]": utilityStyles.u86,
  "size-[13px]": utilityStyles.u87,
  "size-full": utilityStyles.u88,
  "h-0.5": utilityStyles.u89,
  "h-0.75": utilityStyles.u90,
  "h-1.5": utilityStyles.u91,
  "h-2": utilityStyles.u92,
  "h-3": utilityStyles.u93,
  "h-3.5": utilityStyles.u94,
  "h-4": utilityStyles.u95,
  "h-5": utilityStyles.u96,
  "h-6": utilityStyles.u97,
  "h-7": utilityStyles.u98,
  "h-8": utilityStyles.u99,
  "h-9": utilityStyles.u100,
  "h-10": utilityStyles.u101,
  "h-11": utilityStyles.u102,
  "h-12": utilityStyles.u103,
  "h-25": utilityStyles.u104,
  "h-[14px]": utilityStyles.u105,
  "h-[18px]": utilityStyles.u106,
  "h-[20px]": utilityStyles.u107,
  "h-[22px]": utilityStyles.u108,
  "h-[25px]": utilityStyles.u109,
  "h-[26px]": utilityStyles.u110,
  "h-[27px]": utilityStyles.u111,
  "h-[30px]": utilityStyles.u112,
  "h-[32px]": utilityStyles.u113,
  "h-[34px]": utilityStyles.u114,
  "h-[37px]": utilityStyles.u115,
  "h-[38px]": utilityStyles.u116,
  "h-[42px]": utilityStyles.u117,
  "h-[44px]": utilityStyles.u118,
  "h-[48px]": utilityStyles.u119,
  "h-[49px]": utilityStyles.u120,
  "h-[52px]": utilityStyles.u121,
  "h-[58px]": utilityStyles.u122,
  "h-[60px]": utilityStyles.u123,
  "h-[64px]": utilityStyles.u124,
  "h-[68px]": utilityStyles.u125,
  "h-[72px]": utilityStyles.u126,
  "h-[74px]": utilityStyles.u127,
  "h-[80px]": utilityStyles.u128,
  "h-[84px]": utilityStyles.u129,
  "h-[88px]": utilityStyles.u130,
  "h-[98px]": utilityStyles.u131,
  "h-[100px]": utilityStyles.u132,
  "h-[104px]": utilityStyles.u133,
  "h-[108px]": utilityStyles.u134,
  "h-[112px]": utilityStyles.u135,
  "h-[122px]": utilityStyles.u136,
  "h-[132px]": utilityStyles.u137,
  "h-[210px]": utilityStyles.u138,
  "h-[216px]": utilityStyles.u139,
  "h-[256px]": utilityStyles.u140,
  "h-[278px]": utilityStyles.u141,
  "h-[348px]": utilityStyles.u142,
  "h-[618px]": utilityStyles.u143,
  "h-[min(560px,calc(100vh-72px))]": utilityStyles.u144,
  "h-full": utilityStyles.u145,
  "h-px": utilityStyles.u146,
  "max-h-48": utilityStyles.u147,
  "max-h-52": utilityStyles.u148,
  "max-h-[150px]": utilityStyles.u149,
  "max-h-[171px]": utilityStyles.u150,
  "max-h-[320px]": utilityStyles.u151,
  "min-h-0": utilityStyles.u152,
  "min-h-5": utilityStyles.u153,
  "min-h-5.75": utilityStyles.u154,
  "min-h-6": utilityStyles.u155,
  "min-h-9": utilityStyles.u156,
  "min-h-[69px]": utilityStyles.u157,
  "min-h-full": utilityStyles.u158,
  "w-2": utilityStyles.u159,
  "w-3": utilityStyles.u160,
  "w-3/4": utilityStyles.u161,
  "w-5/6": utilityStyles.u162,
  "w-10": utilityStyles.u163,
  "w-12": utilityStyles.u164,
  "w-14": utilityStyles.u165,
  "w-20": utilityStyles.u166,
  "w-24": utilityStyles.u167,
  "w-28": utilityStyles.u168,
  "w-35": utilityStyles.u169,
  "w-[7px]": utilityStyles.u170,
  "w-[13px]": utilityStyles.u171,
  "w-[48px]": utilityStyles.u172,
  "w-[49px]": utilityStyles.u173,
  "w-[58px]": utilityStyles.u174,
  "w-[68px]": utilityStyles.u175,
  "w-[80px]": utilityStyles.u176,
  "w-[92px]": utilityStyles.u177,
  "w-[97px]": utilityStyles.u178,
  "w-[120px]": utilityStyles.u179,
  "w-[150px]": utilityStyles.u180,
  "w-[220px]": utilityStyles.u181,
  "w-[256px]": utilityStyles.u182,
  "w-[260px]": utilityStyles.u183,
  "w-[280px]": utilityStyles.u184,
  "w-[284px]": utilityStyles.u185,
  "w-[332px]": utilityStyles.u186,
  "w-[min(520px,calc(100%-32px))]": utilityStyles.u187,
  "w-[min(620px,calc(100vw-64px))]": utilityStyles.u188,
  "w-[min(760px,calc(100vw-40px))]": utilityStyles.u189,
  "w-fit": utilityStyles.u190,
  "w-full": utilityStyles.u191,
  "w-max": utilityStyles.u192,
  "w-px": utilityStyles.u193,
  "max-w-5xl": utilityStyles.u194,
  "max-w-14": utilityStyles.u195,
  "max-w-16": utilityStyles.u196,
  "max-w-18": utilityStyles.u197,
  "max-w-22": utilityStyles.u198,
  "max-w-[530px]": utilityStyles.u199,
  "max-w-full": utilityStyles.u200,
  "min-w-0": utilityStyles.u201,
  "min-w-0.75": utilityStyles.u202,
  "min-w-1": utilityStyles.u203,
  "min-w-2": utilityStyles.u204,
  "min-w-4.5": utilityStyles.u205,
  "min-w-5": utilityStyles.u206,
  "min-w-[600px]": utilityStyles.u207,
  "min-w-full": utilityStyles.u208,
  "flex-1": utilityStyles.u209,
  "shrink-0": utilityStyles.u210,
  "-translate-x-1/2": utilityStyles.u211,
  "-translate-x-full": utilityStyles.u212,
  "cursor-grab": utilityStyles.u213,
  "cursor-grabbing": utilityStyles.u214,
  "cursor-pointer": utilityStyles.u215,
  "[scrollbar-width:thin]": utilityStyles.u216,
  "scrollbar-none": utilityStyles.u217,
  "list-none": utilityStyles.u218,
  "grid-cols-3": utilityStyles.u219,
  "grid-cols-4": utilityStyles.u220,
  "grid-cols-5": utilityStyles.u221,
  "grid-cols-[8px_94px_46px_56px_56px_56px_38px_minmax(96px,1fr)]":
    utilityStyles.u222,
  "grid-cols-[8px_minmax(0,1fr)]": utilityStyles.u223,
  "grid-cols-[40px_minmax(0,1fr)]": utilityStyles.u224,
  "grid-cols-[80px_minmax(0,1fr)]": utilityStyles.u225,
  "grid-cols-[86px_minmax(0,1fr)]": utilityStyles.u226,
  "grid-cols-[90px_minmax(0,1fr)]": utilityStyles.u227,
  "grid-cols-[92px_minmax(0,1fr)]": utilityStyles.u228,
  "grid-cols-[96px_minmax(0,1fr)_minmax(120px,0.7fr)]": utilityStyles.u229,
  "grid-cols-[96px_minmax(0,1fr)_minmax(140px,0.7fr)]": utilityStyles.u230,
  "grid-cols-[110px_minmax(0,1fr)]": utilityStyles.u231,
  "grid-cols-[120px_minmax(0,1fr)]": utilityStyles.u232,
  "grid-cols-[150px_minmax(0,1fr)]": utilityStyles.u233,
  "grid-cols-[260px_8px_minmax(0,1fr)]": utilityStyles.u234,
  "grid-cols-[332px_232px]": utilityStyles.u235,
  "grid-cols-[auto_minmax(0,1fr)]": utilityStyles.u236,
  "grid-cols-[minmax(0,1fr)_376px]": utilityStyles.u237,
  "grid-cols-[minmax(0,1fr)_auto]": utilityStyles.u238,
  "grid-cols-[minmax(140px,0.5fr)_minmax(0,1fr)]": utilityStyles.u239,
  "grid-cols-[minmax(140px,0.6fr)_minmax(0,1fr)_minmax(140px,0.7fr)]":
    utilityStyles.u240,
  "grid-cols-[minmax(180px,260px)_minmax(0,1fr)]": utilityStyles.u241,
  "grid-cols-[repeat(20,minmax(0,1fr))]": utilityStyles.u242,
  "grid-rows-[38px_minmax(0,1fr)]": utilityStyles.u243,
  "grid-rows-[42px_minmax(0,1fr)]": utilityStyles.u244,
  "grid-rows-[60px_1px_40px_1px_26px_1px_minmax(0,1fr)]": utilityStyles.u245,
  "grid-rows-[94px_minmax(0,1fr)]": utilityStyles.u246,
  "grid-rows-[auto_auto_auto_minmax(0,1fr)]": utilityStyles.u247,
  "grid-rows-[auto_minmax(0,1fr)]": utilityStyles.u248,
  "flex-col": utilityStyles.u249,
  "flex-wrap": utilityStyles.u250,
  "place-items-center": utilityStyles.u251,
  "content-start": utilityStyles.u252,
  "items-baseline": utilityStyles.u253,
  "items-center": utilityStyles.u254,
  "items-start": utilityStyles.u255,
  "justify-between": utilityStyles.u256,
  "justify-center": utilityStyles.u257,
  "justify-end": utilityStyles.u258,
  "gap-0": utilityStyles.u259,
  "gap-0.5": utilityStyles.u260,
  "gap-1": utilityStyles.u261,
  "gap-1.5": utilityStyles.u262,
  "gap-2": utilityStyles.u263,
  "gap-2.5": utilityStyles.u264,
  "gap-3": utilityStyles.u265,
  "gap-4": utilityStyles.u266,
  "gap-[3px]": utilityStyles.u267,
  "gap-[5px]": utilityStyles.u268,
  "gap-[6px]": utilityStyles.u269,
  "gap-[7px]": utilityStyles.u270,
  "gap-[9px]": utilityStyles.u271,
  "gap-[14px]": utilityStyles.u272,
  "gap-px": utilityStyles.u273,
  "gap-x-2": utilityStyles.u274,
  "gap-x-3.5": utilityStyles.u275,
  "gap-y-1.5": utilityStyles.u276,
  "self-center": utilityStyles.u277,
  truncate: utilityStyles.u278,
  "overflow-auto": utilityStyles.u279,
  "overflow-hidden": utilityStyles.u280,
  "overflow-visible": utilityStyles.u281,
  "overflow-x-auto": utilityStyles.u282,
  "overflow-y-hidden": utilityStyles.u283,
  rounded: utilityStyles.u284,
  "rounded-[1px]": utilityStyles.u285,
  "rounded-[2px]": utilityStyles.u286,
  "rounded-[4px]": utilityStyles.u287,
  "rounded-[var(--radius-control)]": utilityStyles.u288,
  "rounded-[var(--radius-overlay)]": utilityStyles.u289,
  "rounded-[var(--radius-panel)]": utilityStyles.u290,
  "rounded-[var(--radius-popover)]": utilityStyles.u291,
  "rounded-full": utilityStyles.u292,
  "rounded-sm": utilityStyles.u293,
  "rounded-xs": utilityStyles.u294,
  "rounded-t-sm": utilityStyles.u295,
  border: utilityStyles.u296,
  "border-y": utilityStyles.u297,
  "border-t": utilityStyles.u298,
  "border-r": utilityStyles.u299,
  "border-b": utilityStyles.u300,
  "border-b-0": utilityStyles.u301,
  "border-l": utilityStyles.u302,
  "border-l-2": utilityStyles.u303,
  "border-(--bg-canvas)": utilityStyles.u304,
  "border-(--bg-control)": utilityStyles.u305,
  "border-(--border-subtle)": utilityStyles.u306,
  "border-(--danger)": utilityStyles.u307,
  "border-(--line)": utilityStyles.u308,
  "border-(--line-subtle)": utilityStyles.u309,
  "border-[color-mix(in_srgb,var(--error)_30%,transparent)]":
    utilityStyles.u310,
  "border-[color-mix(in_srgb,var(--warning)_28%,transparent)]":
    utilityStyles.u311,
  "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]":
    utilityStyles.u312,
  "border-[var(--error)]": utilityStyles.u313,
  "border-[var(--tone-error-border)]": utilityStyles.u314,
  "border-[var(--tone-warning-border)]": utilityStyles.u315,
  "bg-(--background)": utilityStyles.u316,
  "bg-(--bg-canvas)": utilityStyles.u317,
  "bg-(--bg-canvas)/80": utilityStyles.u318,
  "bg-(--bg-control)": utilityStyles.u319,
  "bg-(--bg-overlay)": utilityStyles.u320,
  "bg-(--bg-panel)": utilityStyles.u321,
  "bg-(--bg-panel-header)": utilityStyles.u322,
  "bg-(--bg-panel-muted)": utilityStyles.u323,
  "bg-(--bg-scrim)": utilityStyles.u324,
  "bg-(--bg-surface-muted)": utilityStyles.u325,
  "bg-(--border-subtle)": utilityStyles.u326,
  "bg-(--elevated)": utilityStyles.u327,
  "bg-(--fg-tertiary)": utilityStyles.u328,
  "bg-(--line)": utilityStyles.u329,
  "bg-(--line-subtle)": utilityStyles.u330,
  "bg-(--sidebar)": utilityStyles.u331,
  "bg-(--surface)": utilityStyles.u332,
  "bg-[color-mix(in_srgb,var(--bg-canvas)_84%,transparent)]":
    utilityStyles.u333,
  "bg-[color-mix(in_srgb,var(--bg-canvas)_90%,transparent)]":
    utilityStyles.u334,
  "bg-[color-mix(in_srgb,var(--bg-canvas)_92%,transparent)]":
    utilityStyles.u335,
  "bg-[color-mix(in_srgb,var(--error)_8%,transparent)]": utilityStyles.u336,
  "bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]": utilityStyles.u337,
  "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]": utilityStyles.u338,
  "bg-[var(--error)]": utilityStyles.u339,
  "bg-[var(--tone-warning-bg)]": utilityStyles.u340,
  "bg-transparent": utilityStyles.u341,
  "bg-[linear-gradient(90deg,transparent_0%,transparent_24.8%,var(--line)_25%,transparent_25.2%,transparent_49.8%,var(--line)_50%,transparent_50.2%,transparent_74.8%,var(--line)_75%,transparent_75.2%)]":
    utilityStyles.u342,
  "p-0": utilityStyles.u343,
  "p-2": utilityStyles.u344,
  "p-2.5": utilityStyles.u345,
  "p-3": utilityStyles.u346,
  "p-4": utilityStyles.u347,
  "px-1": utilityStyles.u348,
  "px-1.5": utilityStyles.u349,
  "px-2": utilityStyles.u350,
  "px-2.5": utilityStyles.u351,
  "px-3": utilityStyles.u352,
  "px-3.5": utilityStyles.u353,
  "px-4": utilityStyles.u354,
  "px-[10px]": utilityStyles.u355,
  "py-0": utilityStyles.u356,
  "py-0.5": utilityStyles.u357,
  "py-1": utilityStyles.u358,
  "py-1.5": utilityStyles.u359,
  "py-2": utilityStyles.u360,
  "py-2.5": utilityStyles.u361,
  "py-3": utilityStyles.u362,
  "py-[7px]": utilityStyles.u363,
  "py-[14px]": utilityStyles.u364,
  "pt-0": utilityStyles.u365,
  "pt-1.5": utilityStyles.u366,
  "pt-2.5": utilityStyles.u367,
  "pt-3": utilityStyles.u368,
  "pt-4": utilityStyles.u369,
  "pt-7": utilityStyles.u370,
  "pt-[11px]": utilityStyles.u371,
  "pt-[14px]": utilityStyles.u372,
  "pr-0": utilityStyles.u373,
  "pr-7": utilityStyles.u374,
  "pb-1.5": utilityStyles.u375,
  "pb-2": utilityStyles.u376,
  "pb-2.5": utilityStyles.u377,
  "pb-[9px]": utilityStyles.u378,
  "pb-[11px]": utilityStyles.u379,
  "pl-2": utilityStyles.u380,
  "pl-7": utilityStyles.u381,
  "text-center": utilityStyles.u382,
  "text-left": utilityStyles.u383,
  "text-right": utilityStyles.u384,
  "font-mono": utilityStyles.u385,
  "font-sans": utilityStyles.u386,
  "text-sm": utilityStyles.u387,
  "text-xs": utilityStyles.u388,
  "text-[7.5px]": utilityStyles.u389,
  "text-[8.5px]": utilityStyles.u390,
  "text-[8px]": utilityStyles.u391,
  "text-[9.5px]": utilityStyles.u392,
  "text-[9px]": utilityStyles.u393,
  "text-[10px]": utilityStyles.u394,
  "text-[11px]": utilityStyles.u395,
  "text-[12px]": utilityStyles.u396,
  "text-[13px]": utilityStyles.u397,
  "text-[14px]": utilityStyles.u398,
  "text-[15px]": utilityStyles.u399,
  "text-[16px]": utilityStyles.u400,
  "leading-4": utilityStyles.u401,
  "leading-5": utilityStyles.u402,
  "leading-[0]": utilityStyles.u403,
  "leading-[14px]": utilityStyles.u404,
  "leading-[15px]": utilityStyles.u405,
  "leading-[17px]": utilityStyles.u406,
  "leading-[18px]": utilityStyles.u407,
  "leading-[22px]": utilityStyles.u408,
  "leading-[normal]": utilityStyles.u409,
  "leading-none": utilityStyles.u410,
  "leading-normal": utilityStyles.u411,
  "font-bold": utilityStyles.u412,
  "font-medium": utilityStyles.u413,
  "font-normal": utilityStyles.u414,
  "font-semibold": utilityStyles.u415,
  "tracking-[0.04em]": utilityStyles.u416,
  "tracking-[0.06em]": utilityStyles.u417,
  "tracking-[0.08em]": utilityStyles.u418,
  "tracking-tight": utilityStyles.u419,
  "break-all": utilityStyles.u420,
  "text-ellipsis": utilityStyles.u421,
  "whitespace-nowrap": utilityStyles.u422,
  "whitespace-pre-wrap": utilityStyles.u423,
  "text-(--accent)": utilityStyles.u424,
  "text-(--danger)": utilityStyles.u425,
  "text-(--error)": utilityStyles.u426,
  "text-(--fg-primary)": utilityStyles.u427,
  "text-(--fg-quaternary)": utilityStyles.u428,
  "text-(--fg-secondary)": utilityStyles.u429,
  "text-(--fg-tertiary)": utilityStyles.u430,
  "text-(--foreground)": utilityStyles.u431,
  "text-(--muted)": utilityStyles.u432,
  "text-(--muted-deep)": utilityStyles.u433,
  "text-(--secondary)": utilityStyles.u434,
  "text-(--success)": utilityStyles.u435,
  "text-(--tone-error-fg)": utilityStyles.u436,
  "text-(--tone-success-fg)": utilityStyles.u437,
  "text-(--tone-warning-fg)": utilityStyles.u438,
  "text-(--warning)": utilityStyles.u439,
  "text-[color-mix(in_srgb,var(--warning)_72%,var(--foreground))]":
    utilityStyles.u440,
  "text-[var(--tone-error-fg)]": utilityStyles.u441,
  capitalize: utilityStyles.u442,
  "normal-case": utilityStyles.u443,
  uppercase: utilityStyles.u444,
  "opacity-0": utilityStyles.u445,
  "opacity-90": utilityStyles.u446,
  "opacity-[0.65]": utilityStyles.u447,
  "shadow-(--elevation-control)": utilityStyles.u448,
  "shadow-(--elevation-overlay)": utilityStyles.u449,
  "shadow-(--elevation-panel)": utilityStyles.u450,
  "outline-hidden": utilityStyles.u451,
  transition: utilityStyles.u452,
  "transition-all": utilityStyles.u453,
  "transition-colors": utilityStyles.u454,
  "transition-opacity": utilityStyles.u455,
  "select-none": utilityStyles.u456,
  "first:mt-0": utilityStyles.u457,
  "first:pl-0": utilityStyles.u458,
  "last:border-r-0": utilityStyles.u459,
  "last:border-b-0": utilityStyles.u460,
  "focus-within:border-(--accent)": utilityStyles.u461,
  "focus-within:bg-(--bg-control-hover)": utilityStyles.u462,
  "hover:border-(--fg-quaternary)": utilityStyles.u463,
  "hover:border-(--line-strong)": utilityStyles.u464,
  "hover:bg-(--bg-control-hover)": utilityStyles.u465,
  "hover:bg-(--bg-row-hover)": utilityStyles.u466,
  "hover:bg-(--hover)": utilityStyles.u467,
  "hover:text-(--fg-primary)": utilityStyles.u468,
  "hover:text-(--foreground)": utilityStyles.u469,
  "focus-visible:outline-2": utilityStyles.u470,
  "focus-visible:outline-offset-1": utilityStyles.u471,
  "focus-visible:outline-offset-2": utilityStyles.u472,
  "focus-visible:outline-(--focus-ring)": utilityStyles.u473,
  "disabled:cursor-default": utilityStyles.u474,
  "max-[1100px]:hidden": utilityStyles.u475,
  "max-xl:grid-cols-1": utilityStyles.u476,
  "max-md:hidden": utilityStyles.u477,
  "max-md:grid-cols-1": utilityStyles.u478,
  "max-sm:top-3": utilityStyles.u479,
  "max-sm:mt-1": utilityStyles.u480,
  "max-sm:block": utilityStyles.u481,
  "max-sm:hidden": utilityStyles.u482,
  "max-sm:h-[min(520px,calc(100vh-24px))]": utilityStyles.u483,
  "max-sm:w-[calc(100vw-20px)]": utilityStyles.u484,
  "md:grid-cols-2": utilityStyles.u485,
  "md:grid-cols-3": utilityStyles.u486,
  "md:grid-cols-4": utilityStyles.u487,
  "lg:grid-cols-2": utilityStyles.u488,
  "-bottom-1": utilityStyles.u489,
  "-bottom-1.5": utilityStyles.u490,
  "-left-1.5": utilityStyles.u491,
  "-right-1.5": utilityStyles.u492,
  "-top-1.5": utilityStyles.u493,
  "grid-cols-[28px_minmax(0,1fr)_auto]": utilityStyles.u494,
  "max-sm:grid-cols-[28px_minmax(0,1fr)]": utilityStyles.u495,
  "pb-0": utilityStyles.u496,
  "pt-2": utilityStyles.u497,
  "focus-visible:outline-offset-[-2px]": utilityStyles.u498,
  "hover:bg-(--bg-control)": utilityStyles.u499,
  "hover:border-(--line)": utilityStyles.u500,
  "hover:brightness-110": utilityStyles.u501,
  "hover:text-(--error)": utilityStyles.u502,
  "data-[active]:border-(--accent)": utilityStyles.u503,
  "data-[active]:border-b": utilityStyles.u504,
  "data-[active]:font-medium": utilityStyles.u505,
  "data-[active]:text-(--fg-primary)": utilityStyles.u506,
  "data-[starting-style]:translate-y-1": utilityStyles.u507,
  "data-[starting-style]:translate-x-2": utilityStyles.u508,
  "data-[starting-style]:opacity-0": utilityStyles.u509,
  "placeholder:text-(--fg-quaternary)": utilityStyles.u510,
  "z-1": utilityStyles.u511,
  "mr-1.5": utilityStyles.u512,
  ...fallbackStyleByClassName,
} as Record<string, unknown>;

function splitStyleTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if ("{[(".includes(character)) depth += 1;
    else if ("}])".includes(character)) depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Internal bridge for legacy call sites while each vertical slice moves to
 * named StyleX slots. The returned class name is generated by StyleX; unknown
 * project or Module classes are preserved for their existing contracts.
 */
export function stylexClassName(value: string | null | undefined): string {
  if (!value) return "";
  const generated: unknown[] = [];
  const passthrough: string[] = [];
  for (const token of splitStyleTokens(value)) {
    const style = utilityStyleByClassName[token];
    if (style) generated.push(style);
    else passthrough.push(token);
  }
  const props = stylex.props(...(generated as never[]));
  return [passthrough.join(" "), props.className].filter(Boolean).join(" ");
}
