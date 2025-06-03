# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/dwarvesf/mcp-playbook/compare/v1.3.0...v1.4.0) (2025-06-03)

### Features

- allow append mode for distill project runbook tool ([cc0e50c](https://github.com/dwarvesf/mcp-playbook/commit/cc0e50c8a982dc837e84313252b8a2bb96d658a0))

### Bug Fixes

- hint on it being append-only ([12fe221](https://github.com/dwarvesf/mcp-playbook/commit/12fe221bf17ab245439360dfb2dc0dc36d90d35e))

## [1.3.0](https://github.com/dwarvesf/mcp-playbook/compare/v1.2.0...v1.3.0) (2025-06-02)

### Features

- Add distill project runbook tool ([#3](https://github.com/dwarvesf/mcp-playbook/issues/3)) ([78b6146](https://github.com/dwarvesf/mcp-playbook/commit/78b6146fcd133c96b5ecea1bb9f3de22e4c72678))

## [1.2.0](https://github.com/dwarvesf/mcp-playbook/compare/v1.1.0...v1.2.0) (2025-05-30)

### Features

- standardize chatlog format and filename ([#2](https://github.com/dwarvesf/mcp-playbook/issues/2)) ([def85c4](https://github.com/dwarvesf/mcp-playbook/commit/def85c464042d27de6eb4e3ccd4d1a604373bcda))

## 1.1.0 (2025-05-29)

### Features

- Add guidelines for first principles thinking and avoiding redundant comments to initPlaybookPrompt ([500de99](https://github.com/dwarvesf/mcp-playbook/commit/500de996bc95b2415cc0a88394b04ace2386c2b3))
- add init_playbook tool and handler ([ad74848](https://github.com/dwarvesf/mcp-playbook/commit/ad748486d3271383e8eaa826fa15eac821195056))
- add keyword word count validation to search tools ([020f941](https://github.com/dwarvesf/mcp-playbook/commit/020f94152d22d70ef103b63c89f9ee05ffc0eca1))
- add project-logs prefix to chat log path ([9ee2b66](https://github.com/dwarvesf/mcp-playbook/commit/9ee2b66e6a9ca2bf5733263594262ed28e4c56d7))
- add prompt handling and extract init playbook prompt ([7fcf7a0](https://github.com/dwarvesf/mcp-playbook/commit/7fcf7a061c8edf0d47ac5b614da392b771a98eaf))
- add search_prompts tool and update devbox ([d68fe80](https://github.com/dwarvesf/mcp-playbook/commit/d68fe80a956abaaac30a22029f0675a5c666570a))
- add search_runbook tool ([31b0d85](https://github.com/dwarvesf/mcp-playbook/commit/31b0d85d1bf2a3a8d26b1d80406bf35a39bf657a))
- add suggest_runbook tool ([de85b59](https://github.com/dwarvesf/mcp-playbook/commit/de85b595f8d2819b83ac06dadd46be1bb2fe4c38))
- add support for additional search qualifiers in searchCode ([72ace5d](https://github.com/dwarvesf/mcp-playbook/commit/72ace5daccdd68dc9dc6bca060295b8a6ba86b52))
- add sync_prompt tool and update init playbook prompt ([140c1d7](https://github.com/dwarvesf/mcp-playbook/commit/140c1d7619d1fa9dfda3cf216115aba25811481c))
- add writing assistance guideline to initPlaybookPrompt ([a4d92ef](https://github.com/dwarvesf/mcp-playbook/commit/a4d92ef94f4344a2a463cd8ba50c0593052190e8))
- add Zed editor chat log parsing and syncing ([b63e7f0](https://github.com/dwarvesf/mcp-playbook/commit/b63e7f0fe4c20c3762fddba4427ac8f9b0a0467f))
- add zod schema integration for tool input validation ([2d0e6e5](https://github.com/dwarvesf/mcp-playbook/commit/2d0e6e56030f8883c905b8400823a0e9a2f1aaca))
- **chatlog:** implement cursor chat log parsing and upload ([3f31878](https://github.com/dwarvesf/mcp-playbook/commit/3f318783853d52be6cdaf570264b28fd77888b5a))
- **cline-sync:** implement chat log parser and sync for Cline editor ([c655d34](https://github.com/dwarvesf/mcp-playbook/commit/c655d343fed92128d8dc5c6457c0d62aa2c3bb67))
- **deps:** Add dotenv and @modelcontextprotocol/sdk ([8342fda](https://github.com/dwarvesf/mcp-playbook/commit/8342fda9590a455553a12a2bdad694209edccb02))
- Implement initial mcp-playbook server structure and files ([9c50704](https://github.com/dwarvesf/mcp-playbook/commit/9c50704c74c63f0495909dd2d4551e6e1c616f11))
- Implement MCP server entry point in index.ts ([f9b67bd](https://github.com/dwarvesf/mcp-playbook/commit/f9b67bd9bcea2868f0d131365a98e1715a008fd6))
- make editorType mandatory for save_and_upload_chat_log ([6c501d7](https://github.com/dwarvesf/mcp-playbook/commit/6c501d7e88ebafbc1e1566730c5b195aa09b3829))
- **mcp-playbook:** Implement git database sync for chat logs ([88b9609](https://github.com/dwarvesf/mcp-playbook/commit/88b960903b67fb853ad774ed595cc6fa26d4c65a))
- move to [@dwarvesf](https://github.com/dwarvesf) ([7ef629c](https://github.com/dwarvesf/mcp-playbook/commit/7ef629c626c831a6ecfc122925379325c1b9c322))
- optimize GitHub content fetching in handlers using Promise.all ([b2582d3](https://github.com/dwarvesf/mcp-playbook/commit/b2582d3e70ce12e3ee32c2474c9b0cf6ba33c863))
- **prompt:** update init_playbook to encourage proactive syncing ([7719577](https://github.com/dwarvesf/mcp-playbook/commit/77195770c315d97e1b4a87299b4ce4d1aa9c4843))
- remove userId from saveAndUploadChatLog tool ([96c795c](https://github.com/dwarvesf/mcp-playbook/commit/96c795c37fd46f16341d4518a4ffee7767a9c8f1))
- **search:** enhance runbook search query and update docs ([1dbf3ec](https://github.com/dwarvesf/mcp-playbook/commit/1dbf3ec028dc16f471475949ef775ff17714571b))
- **tooling:** add think tool for LLM reasoning ([5a53ef1](https://github.com/dwarvesf/mcp-playbook/commit/5a53ef16575564a1da5637238e0f600e1e44a7ed))
- update documentation tools and handlers ([51d402a](https://github.com/dwarvesf/mcp-playbook/commit/51d402a3f701977ab26c8766c115553c13df294d))
- update init playbook prompt with runbook guidance ([b32e2c9](https://github.com/dwarvesf/mcp-playbook/commit/b32e2c918e1a1c7f18d9ba8f54eb091bd2fb2b94))
- update initPlaybookPrompt to encourage search_runbook usage ([b3f402d](https://github.com/dwarvesf/mcp-playbook/commit/b3f402dc997a3d40dd99047e7b99ce23a38ddbec))
- update inst and return userId along with the instructions ([15624b2](https://github.com/dwarvesf/mcp-playbook/commit/15624b2bc199dfe0c91e6d021f31a65d0d34722b))

### Bug Fixes

- add hint for planning ([2695319](https://github.com/dwarvesf/mcp-playbook/commit/2695319c23893059e73a9d0ba22fe9c94867a9e2))
- add nudging for branching standards ([7b716e8](https://github.com/dwarvesf/mcp-playbook/commit/7b716e831afdafc1df479b3d40c7a74ecad8e4f4))
- adjust think guideline ([b99a648](https://github.com/dwarvesf/mcp-playbook/commit/b99a648106534eaa1cd6135a7465d29513285cd5))
- allow for relative paths ([670f5d1](https://github.com/dwarvesf/mcp-playbook/commit/670f5d1c404bda8f05496e9cfedae6b4391152c5))
- **build:** copy build story for MCP ([2da8846](https://github.com/dwarvesf/mcp-playbook/commit/2da8846942f7ea9d529fb361ad78a838f0bd14f1))
- clean up prompt ([5b7fc04](https://github.com/dwarvesf/mcp-playbook/commit/5b7fc04c9b6064782ac0954a663632db63b2cc00))
- **core:** default to non-win32 path parsing and correct cline log check ([bdc4a0a](https://github.com/dwarvesf/mcp-playbook/commit/bdc4a0a7db83512a5605b8fa18b72aa3e0b167c4))
- **definitions:** standardize unique id ([4ae1e3c](https://github.com/dwarvesf/mcp-playbook/commit/4ae1e3c1f2caf7731cdaa56703dd71ecadb1b16c))
- format files ([77516c5](https://github.com/dwarvesf/mcp-playbook/commit/77516c58837b4709ebcba3149975b38f5da92cbe))
- guarantee absolute path ([f776f31](https://github.com/dwarvesf/mcp-playbook/commit/f776f31e10c583278b634f760b26eac68100b27c))
- make sure suggest_runbook includes only general details ([c3c0330](https://github.com/dwarvesf/mcp-playbook/commit/c3c0330e727ec8b8f04509a1bb4b051fccada20f))
- move env to colocate on mcp ([f7ba2cd](https://github.com/dwarvesf/mcp-playbook/commit/f7ba2cd14883ec6896eb3a7566c6152fe9f3c1a7))
- nudge away from syncing at every turn ([1ed8eae](https://github.com/dwarvesf/mcp-playbook/commit/1ed8eaedcfaffc01b24a4c02eb414b877ad957b4))
- **path:** make sure we hint at only absolute paths ([5b203f0](https://github.com/dwarvesf/mcp-playbook/commit/5b203f0a7f6f3ebb7937425ff435944fa9e9d3a7))
- **prompt:** remove leaky abstraction and add style to guideline ([71b8a43](https://github.com/dwarvesf/mcp-playbook/commit/71b8a4375107255546719b4090fcbf132f3d0ed3))
- Resolve typescript compilation errors in index.ts ([acb1040](https://github.com/dwarvesf/mcp-playbook/commit/acb10405cc829384048f3bf22eb8e65e47462bc0))
- type definitions to follow mcp standards ([a58fb8b](https://github.com/dwarvesf/mcp-playbook/commit/a58fb8b7576b81f6d5159787a3c89e5f7f96a702))
- update Dockerfile to include build essentials for sqlite3 ([dfdc451](https://github.com/dwarvesf/mcp-playbook/commit/dfdc45109d7d5275784a4775e8b0d7ff0d80430b))
- update tool desc to avoid init loop ([dc17094](https://github.com/dwarvesf/mcp-playbook/commit/dc170947db6ee2ce0d4dc642ed46ec6edcc38e2e))
- use console.error instead to preserve stdio ([ae2d153](https://github.com/dwarvesf/mcp-playbook/commit/ae2d153001f0c946495f49cdceedeb067213a1df))
