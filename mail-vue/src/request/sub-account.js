/*
 * STABLE GUARD:
 * 子邮箱请求层供子邮箱管理、Token 接码、资产邮箱接管使用。
 * 禁止随意删除 token/ensure/import/scan 等接口封装。
 */
import http from '@/axios/index.js'

export function subAccountList(params) {
    return http.get('/subAccount/list', {params: {...params}})
}

export function subAccountAdd(form) {
    return http.post('/subAccount/add', form)
}

export function subAccountImport(form) {
    return http.post('/subAccount/import', form)
}

export function subAccountEnsureAssets(form) {
    return http.post('/subAccount/ensureAssets', form)
}

export function subAccountEnsureManaged(form) {
    return http.post('/subAccount/ensureManaged', form)
}

export function subAccountEnsureFromEmail(form) {
    return http.post('/subAccount/ensureFromEmail', form)
}

export function subAccountScanUnmanaged(form) {
    return http.post('/subAccount/scanUnmanaged', form)
}

export function subAccountSetName(accountId, name) {
    return http.put('/subAccount/setName', {accountId, name})
}

export function subAccountSetTiktok(accountId, tiktokUsername) {
    return http.put('/subAccount/setTiktok', {accountId, tiktokUsername})
}

export function subAccountGetToken(accountId) {
    return http.get('/subAccount/token', {params: {accountId}})
}

export function subAccountGenToken(accountId) {
    return http.post('/subAccount/genToken', {accountId})
}

export function subAccountDelete(accountIds) {
    return http.delete('/subAccount/delete', {params: {accountIds: accountIds + ''}})
}
