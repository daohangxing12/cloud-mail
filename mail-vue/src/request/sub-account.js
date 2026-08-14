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

export function subAccountSetName(accountId, name) {
    return http.put('/subAccount/setName', {accountId, name})
}

export function subAccountSetTiktok(accountId, tiktokUsername) {
    return http.put('/subAccount/setTiktok', {accountId, tiktokUsername})
}

export function subAccountSetCreatorStatus(accountId, creatorStatus) {
    return http.put('/subAccount/setCreatorStatus', {accountId, creatorStatus})
}

export function subAccountSetDeviceNo(accountId, deviceNo) {
    return http.put('/subAccount/setDeviceNo', {accountId, deviceNo})
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
