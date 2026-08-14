import http from '@/axios/index.js';

export function assetSummary() {
    return http.get('/asset/summary');
}

export function assetList(params) {
    return http.get('/asset/list', {params: {...params}});
}

export function assetUpdate(accountId, form) {
    return http.put('/asset/update', {accountId, ...form});
}

export function assetBatchStatus(accountIds, action) {
    return http.put('/asset/batchStatus', {accountIds, action});
}

export function assetScanCreatorRewards(params) {
    return http.post('/asset/creatorRewards/scanHistory', params);
}

export function assetScanTikTokInbox(params) {
    return http.post('/asset/tiktok/scanInbox', params);
}
