# Agent icon provenance

These compact marks identify compatible third-party CLIs. They do not make Super CLI an official
client, partner, or endorsed product. Vendor marks remain the property of their respective owners
and are excluded from Super CLI's MIT license; see [`TRADEMARKS.md`](../../TRADEMARKS.md).

## Vendor-sourced marks

| CLI | Packaged mark | Source |
| --- | --- | --- |
| Claude Code | Claude starburst | [Claude favicon](https://claude.com/favicon.svg) |
| Codex CLI | OpenAI developer mark | [OpenAI Developers favicon](https://developers.openai.com/favicon.svg) and [OpenAI brand guidance](https://openai.com/brand/) |
| GitHub Copilot CLI | Copilot glyph, black/white contrast variants | [Primer Octicons `copilot-48.svg`](https://github.com/primer/octicons/blob/main/icons/copilot-48.svg) |
| Grok CLI | Grok glyph, background removed for transparent light/dark variants | [Grok favicon](https://grok.com/images/favicon.svg) |
| Kilo CLI | Kilo logomark, official current-color artwork rendered in contrast variants | [Kilo repository logo](https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/public/img/logo.svg) |
| Kiro CLI | Official Kiro app mark | [Kiro website icon](https://kiro.dev/icon.svg) |
| OpenClaw CLI | Official static Clawd lobster mark with transparent background | [OpenClaw repository icon](https://github.com/openclaw/openclaw/blob/main/apps/linux/src-tauri/icons/icon.svg) |
| OpenCode | Official light/dark square logomarks | [OpenCode brand assets](https://github.com/anomalyco/opencode/tree/dev/packages/console/app/src/asset/brand) |
| Command Code | Official compact symbol | [Command Code brand assets](https://commandcode.ai/brand) |
| Cursor CLI | Official 2.5D cube | [Cursor brand guidelines](https://cursor.com/brand) |
| Antigravity CLI | Antigravity silhouette with its compact color treatment | [Lobe Icons Antigravity asset](https://github.com/lobehub/lobe-icons) |
| Droid CLI | Factory logomark, with the background removed for transparent compact use | [Factory favicon](https://factory.ai/favicon.svg) |
| Crush | Official HeartBit mark | [Crush repository asset](https://github.com/charmbracelet/crush/blob/main/internal/cmd/stats/heartbit.svg) |
| Devin CLI | Official Devin logomark, with the `1em` sizing and web `style` attributes removed | [Lobe Icons Devin asset](https://github.com/lobehub/lobe-icons) |
| Hermes | Official ACP registry mark | [Hermes Agent repository asset](https://github.com/NousResearch/hermes-agent/blob/main/acp_registry/icon.svg) |
| MiMo Code | Xiaomi 2021 Mi mark | [Xiaomi logo SVG](https://upload.wikimedia.org/wikipedia/commons/a/ae/Xiaomi_logo_%282021-%29.svg) |
| Pi | Official light/dark Pi mark | [Pi website artwork](https://pi.dev/logo-auto.svg) |
| Qoder CLI | Official Qoder logomark, with React/web attributes removed and the `currentColor` token split into light/dark contrast variants | [Lobe Icons Qoder asset](https://github.com/lobehub/lobe-icons) |
| Qwen Code CLI | Official Qwen logomark (Alibaba Cloud's Qwen brand), with React/web attributes removed, the auto-generated gradient id renamed, and the gradient stops flattened to full opacity | [Lobe Icons Qwen asset](https://github.com/lobehub/lobe-icons) |
| Amp | Official color logomark | [Amp website mark](https://ampcode.com/amp-mark-color.svg) |
| OpenClaude | Official terminal-and-git mark | [OpenClaude website asset](https://openclaude.gitlawb.com/openclaude-logo.svg) |
| Oh My Pi | Official gradient Pi favicon | [Oh My Pi website favicon](https://omp.sh/favicon.svg) |
| goose | Official goose mark | [goose repository asset](https://github.com/aaif-goose/goose/blob/main/documentation/static/img/goose.svg) |
| Auggie CLI | Official Augment brace mark, split into static light/dark contrast variants | [Augment website favicon](https://www.augmentcode.com/favicon.svg) |
| Cline CLI | Official Cline robot mark, split into light/dark contrast variants | [Cline repository icon](https://github.com/cline/cline/blob/main/apps/vscode/assets/icons/icon.svg) |
| Continue CLI | Official light/dark Continue marks | [Continue repository artwork](https://github.com/continuedev/continue/tree/main/docs/logo) |
| Mistral Vibe | Official Vibe face mark, split into light/dark contrast variants | [Mistral Vibe Zed extension icon](https://github.com/mistralai/mistral-vibe/blob/main/distribution/zed/icons/mistral_vibe.svg) |
| Rovo Dev CLI | Official blue Rovo mark | [Atlassian Rovo support asset](https://images.ctfassets.net/zsv3d0ugroxu/7GLXCkFtxe0MUSfmTNdrPL/1a042c58b850d16c6eb3339dc4532c0d/logo-light_Rovo_mark_brand_RGB.svg) |

## Project-drawn fallback

The Kimi mark is the approved independent blue-avatar redraw already used by the companion Kimi Code
CLI Launcher project. It is not an official vendor logo.

The Codebuff mark is an approved vector reconstruction of the company-logo raster supplied for this
integration. The white JPEG canvas and antialiasing halo were removed, while the black rounded tile,
white sparkle, and white prompt bar were retained. It is not a vendor-published SVG; the source raster
is the [Codebuff company-logo asset](https://media.licdn.com/dms/image/v2/D560BAQH0rZ-ApkRYLA/company-logo_400_400/B56Zl.LuDrHQAc-/0/1758758625794/codebuff_logo?e=2147483647&v=beta&t=nyuRe-ll-4MoL5E7PmlTxruvm-j91v06MM3Az-pWz5w).

The vendor-sourced SVGs are packaged only as small UI identifiers. Where a source supplies a
theme-aware/current-color mark, Super CLI provides black/white contrast variants without changing
its geometry. The Grok favicon's backdrop, blur, and shadow were omitted because VS Code extension
icons must be static, safe SVGs with a transparent background. Factory's black tile was similarly
removed, while the official logomark geometry was preserved. The Antigravity silhouette and Xiaomi
Mi geometry are preserved from the sources above. The Qoder mark's `height`/`width`/`style` web
attributes were dropped and its single `currentColor` token was replaced with explicit light/dark
contrast fills, keeping the original two-path geometry intact. The Qwen mark's `height`/`width`/
`style` web attributes were similarly dropped, its auto-generated gradient id was renamed, and its
gradient stops' partial opacity was flattened to fully opaque, keeping the original path geometry
and gradient colors intact. The Devin mark had the same `height`/`width`/`style` web attributes
dropped; its three-path geometry and its three brand fills (`#3969CA`, `#21C19A`, `#0294DE`) are
unchanged, and it is packaged as a single mark because those fixed colors read on light and dark
themes alike, so no contrast variants are needed. Augment's embedded theme CSS was replaced by
explicit black/white files; Cline and Mistral Vibe received the same fill-only contrast treatment.
Their source geometry is unchanged.
