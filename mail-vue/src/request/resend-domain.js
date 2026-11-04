import http from '@/axios/index.js';

export const resendDomainList = () => http.post('/resendDomain/list', {})
export const resendDomainGet = (id) => http.post('/resendDomain/get', {id})
export const resendDomainAdd = (domain) => http.post('/resendDomain/add', {domain})
export const resendDomainVerify = (id) => http.post('/resendDomain/verify', {id})
export const resendDomainApplyDns = (id) => http.post('/resendDomain/applyDns', {id})
export const resendSaveKey = (key) => http.post('/resendDomain/saveKey', {key})
