/*
 * STABLE GUARD:
 * 邮件请求层支撑全局收件箱、全局垃圾邮箱、精准拉黑和右侧详情。
 * 禁止随意改参数结构，避免本地接码和前端列表失效。
 */
import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, domain = '', spam = 0, keyword = '') {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, domain, spam, keyword}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive, domain = '', spam = 0) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive, domain, spam}, noMsg: true, timeout: 35 * 1000})
}

export function emailDomainStats() {
    return http.get('/email/domainStats', {noMsg: true})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailBlockSender(emailId) {
    return http.put('/email/blockSender', {emailId})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
