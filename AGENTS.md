# 邮箱系统稳定功能保护规则

本项目已经进入稳定可用状态。后续任何 AI、工程师或自动化工具接手前，必须先阅读本文件和 `STABLE_FEATURES_DO_NOT_BREAK.md`。

## 最高优先级

- 不允许因为 UI 重构、接口整理、清理旧代码，把已经稳定的邮箱功能删除或改回旧结构。
- 不允许把 `mail.ntmcn.com` 网页入口改回 `email.ntmcn.com` 或其它旧入口。
- 不允许把 API / 同步入口从 `https://212202.xyz` 改回 `api.orz.gay`、`ppp.nte.li` 或其它历史测试地址。
- 不允许破坏本地矩阵工具依赖的 `/api/local-agent/*` 接口。
- 不允许把精准拉黑改成域名拉黑；拉黑规则必须按完整邮箱地址处理。
- 不允许把全局收件箱、全局垃圾邮箱、三栏阅读布局、子邮箱 Token 接码、资产中心同步删掉或降级。

## 修改前必须确认

改动以下文件前，必须先说明影响范围，并确认不会破坏稳定功能：

- `mail-vue/src/views/email/index.vue`
- `mail-vue/src/views/spam/index.vue`
- `mail-vue/src/components/email-scroll/index.vue`
- `mail-vue/src/request/email.js`
- `mail-vue/src/request/sub-account.js`
- `mail-vue/src/views/email-assets/index.vue`
- `mail-vue/src/views/sub-account/index.vue`
- `mail-worker/src/api/local-agent-api.js`
- `mail-worker/src/service/local-agent-service.js`
- `mail-worker/src/api/sub-account-api.js`
- `mail-worker/src/service/sub-account-service.js`
- `mail-worker/src/service/asset-service.js`
- `mail-worker/src/security/security.js`
- `mail-worker/wrangler.toml`

## 稳定功能红线

如果用户没有明确要求，禁止做这些事：

- 禁止删除三栏阅读布局。
- 禁止删除邮件列表头像、摘要、搜索栏。
- 禁止删除全局收件箱和全局垃圾邮箱。
- 禁止删除或改坏精准拉黑入口。
- 禁止删除子邮箱 Token 创建、查询、接码链路。
- 禁止删除资产中心邮箱、用户名、粉丝、播放量同步。
- 禁止删除中视频成功/拒绝邮件识别统计。
- 禁止恢复旧的远程任务代理、本地控制台、RPA 任务领取代码。

## 接手原则

先保护稳定功能，再做新增需求。
如果必须改动稳定功能，必须先给出原因、影响范围、回滚方式，再执行。
