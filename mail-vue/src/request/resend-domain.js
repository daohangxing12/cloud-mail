import http from '@/axios/index.js';

export const resendDomainList = () => http.post('/resendDomain/list', {})
export const resendDomainGet = (id) => http.post('/resendDomain/get', {id})
export const resendDomainAdd = (domain) => http.post('/resendDomain/add', {domain})
export const resendDomainVerify = (id) => http.post('/resendDomain/verify', {id})
export const resendDomainApplyDns = (id) => http.post('/resendDomain/applyDns', {id})
export const resendSaveKey = (key) => http.post('/resendDomain/saveKey', {key})
export const sendSenderList = () => http.post('/sendSender/list', {}, {noMsg: true})
export const sendSenderSave = (emails) => http.post('/sendSender/save', {emails})
export const mailDomainList = () => http.post('/mailDomain/list', {})
export const mailDomainAdd = (domain, removeOld = false) => http.post('/mailDomain/add', {domain, removeOld})
export const mailDomainRemove = (domain) => http.post('/mailDomain/remove', {domain})

export const inboxRulesGet = () => http.post('/inboxRules/get', {})
export const inboxRulesSave = (rules) => http.post('/inboxRules/save', {rules})
export const inboxRulesApply = (days = 30) => http.post('/inboxRules/apply', {days})

export const mailDomainSaveToken = (token) => http.post('/mailDomain/saveToken', {token})
export const inboxRulesClean = () => http.post('/inboxRules/clean', {})
export const inboxRulesCleanRemarks = () => http.post('/inboxRules/cleanRemarks', {})
