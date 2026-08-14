# NTMCN 邮箱系统稳定版锁定说明

固定日期：2026-08-09

## 唯一主源码

当前唯一允许开发、构建、部署的邮箱系统源码是：

E:\NTMCN_MAIN\cloud-mail

不要再使用以下位置里的旧版本作为开发或部署入口：

C:\Users\A\Documents\邮箱项目\cloud-mail
C:\Users\A\Documents\邮箱项目\backups\...\cloud-mail
E:\NTMCN_MAIN\_stable_versions\...\cloud-mail

这些旧版本已经归档到：

C:\Users\A\Documents\邮箱项目\_archived_mail_versions\20260715-fixed-stable-main

## 当前必须保留的稳定功能

以下功能是稳定功能，后续修改不能删除、覆盖、改名或绕开：

- mail.ntmcn.com 前端入口
- Cloudflare Worker 后端接口
- 总收件箱入口和总未读数
- 域名收件箱分组
- 垃圾邮箱入口和垃圾未读数
- 子邮箱管理
- 接码 Token 创建/读取接口
- baofa.de、feilong168.com、ntmcn.com 域名支持
- 子邮箱设备号字段
- 子邮箱中视频字段和筛选
- 邮箱资产中心同步
- 本地软件接码链路

## 修改规则

1. 修改前必须确认当前路径是 E:\NTMCN_MAIN\cloud-mail。
2. 不允许从旧版本复制文件直接覆盖当前源码。
3. 不允许因为修一个小功能，顺手重写页面结构。
4. 不允许删除已有入口、筛选、排序、字段和接口。
5. 部署前必须本地构建通过。
6. 部署后必须验证 mail.ntmcn.com 不是 404。
7. 接码相关修改后必须验证 /api/local-agent/sub-account/token 返回 200。

## 当前线上稳定版本

Cloudflare Worker Version ID:

28fcf4fe-1d6f-4e9e-b844-7675baf2d1fb

旧版本 `2012e966-40a8-4085-be09-99aa6f7bed5f` 已作废，不再作为回滚或开发基线。

此文件用于防止以后再次改错目录、部署错版本、覆盖稳定功能。
