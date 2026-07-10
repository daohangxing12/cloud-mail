import http from '@/axios/index.js'

export function assetOverview() {
    return http.get('/asset/overview')
}

export function assetList(params) {
    return http.get('/asset/list', {params: {...params}})
}

export function assetScanCreatorRewards(form) {
    return http.post('/asset/scanCreatorRewards', form)
}
