<template>
  <div class="lq-side">
    <div class="lq-brand">
      <span class="lq-avatar">{{ brandLetter }}</span>
      <span class="lq-brand-name">{{ settingStore.settings.title || 'NTMCN Mail' }}</span>
    </div>
    <div class="lq-account" :title="userStore.user?.email">
      <Icon icon="lucide:at-sign" width="14" height="14"/>
      <span>{{ userStore.user?.email }}</span>
    </div>
    <button v-perm="'email:send'" class="lq-compose" @click="openWriter">
      <Icon icon="lucide:pencil" width="16" height="16"/>
      <span>写信</span>
    </button>

    <el-scrollbar class="lq-scroll">
      <nav class="lq-folders">
        <a :class="{on: route.meta.name === 'email' && !accountStore.currentDomain}" @click="openGlobalInbox">
          <Icon icon="lucide:inbox" width="17" height="17"/><span class="n">收件箱</span>
          <span v-if="globalInboxUnread > 0" class="c">{{ formatUnread(globalInboxUnread) }}</span>
        </a>
        <a class="sub-toggle" @click="domainOpen = !domainOpen">
          <Icon icon="lucide:globe" width="17" height="17"/><span class="n">域名收件箱</span>
          <Icon class="arrow" :class="{open: domainOpen}" icon="lucide:chevron-down" width="15" height="15"/>
        </a>
        <template v-if="domainOpen">
          <a v-for="item in domainAccounts" :key="item.domain" class="sub"
             :class="{on: route.meta.name === 'email' && accountStore.currentDomain === item.domain}"
             @click="selectDomain(item)">
            <span class="n">{{ item.label }}</span>
            <span v-if="item.unreadCount > 0" class="c">{{ formatUnread(item.unreadCount) }}</span>
          </a>
        </template>
        <a :class="{on: route.meta.name === 'other'}" @click="openOther">
          <Icon icon="lucide:bell" width="17" height="17"/><span class="n">其他通知</span>
          <span v-if="otherUnread > 0" class="c">{{ formatUnread(otherUnread) }}</span>
        </a>
        <a :class="{on: route.meta.name === 'spam'}" @click="openSpam">
          <Icon icon="lucide:shield-alert" width="17" height="17"/><span class="n">垃圾邮件</span>
          <span v-if="spamUnread > 0" class="c">{{ formatUnread(spamUnread) }}</span>
        </a>
        <a v-perm="'email:send'" :class="{on: route.meta.name === 'send'}" @click="router.push({name: 'send'})">
          <Icon icon="lucide:send" width="17" height="17"/><span class="n">已发送</span>
        </a>
        <a v-perm="'email:send'" :class="{on: route.meta.name === 'draft'}" @click="router.push({name: 'draft'})">
          <Icon icon="lucide:file-text" width="17" height="17"/><span class="n">草稿箱</span>
        </a>
        <a :class="{on: route.meta.name === 'star'}" @click="router.push({name: 'star'})">
          <Icon icon="lucide:star" width="17" height="17"/><span class="n">星标邮件</span>
        </a>

        <div class="lq-group" v-perm="['all-email:query','user:query','setting:query','analysis:query']">管理</div>
        <a v-perm="'analysis:query'" :class="{on: route.meta.name === 'analysis'}" @click="router.push({name: 'analysis'})">
          <Icon icon="lucide:chart-column" width="17" height="17"/><span class="n">资产概览</span>
        </a>
        <a v-perm="'user:query'" :class="{on: route.meta.name === 'asset-center'}" @click="router.push({name: 'asset-center'})">
          <Icon icon="lucide:database" width="17" height="17"/><span class="n">邮箱资产</span>
        </a>
        <a v-perm="'user:query'" :class="{on: route.meta.name === 'sub-account'}" @click="openSubAccount">
          <Icon icon="lucide:users" width="17" height="17"/><span class="n">子邮箱管理</span>
        </a>
        <a v-perm="'all-email:query'" :class="{on: route.meta.name === 'all-email'}" @click="router.push({name: 'all-email'})">
          <Icon icon="lucide:list" width="17" height="17"/><span class="n">全部邮件</span>
        </a>
        <a :class="{on: route.meta.name === 'setting'}" @click="router.push({name: 'setting'})">
          <Icon icon="lucide:user-cog" width="17" height="17"/><span class="n">个人设置</span>
        </a>
        <a v-perm="'setting:query'" :class="{on: route.meta.name === 'sys-setting'}" @click="router.push({name: 'sys-setting'})">
          <Icon icon="lucide:settings" width="17" height="17"/><span class="n">系统设置</span>
        </a>
      </nav>
    </el-scrollbar>
  </div>
</template>

<script setup>
import router from '@/router/index.js'
import {useRoute} from 'vue-router'
import {Icon} from '@iconify/vue'
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useSettingStore} from '@/store/setting.js'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {useUserStore} from '@/store/user.js'
import {useUiStore} from '@/store/ui.js'
import {emailDomainStats} from '@/request/email.js'

const settingStore = useSettingStore()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const userStore = useUserStore()
const uiStore = useUiStore()
const route = useRoute()
const domainStats = ref({})
const globalInboxUnread = ref(0)
const spamUnread = ref(0)
const otherUnread = ref(0)
const domainOpen = ref(true)
const brandLetter = computed(() => String(settingStore.settings.title || 'N').trim().charAt(0).toUpperCase())

const domainAccounts = computed(() => (settingStore.domainList || []).map(domain => {
  const clean = cleanDomain(domain)
  return {
    domain: clean,
    label: `@${clean}`,
    unreadCount: domainStats.value[clean] || 0,
    accountId: userStore.user?.account?.accountId || 0,
    allReceive: 1,
    domainMode: true
  }
}).filter(item => item.domain))

watch(
    () => [(settingStore.domainList || []).join(','), userStore.user?.account?.accountId],
    () => {
      ensureMailboxState(false)
      fetchDomainStats()
    },
    {immediate: true}
)

watch(
    () => route.query.domain,
    (domain) => {
      if (route.name !== 'sub-account' || !domain) return
      const item = findDomain(domain)
      if (item) changeDomain(item, false)
    },
    {immediate: true}
)

onMounted(() => {
  window.addEventListener('mail-unread-changed', fetchDomainStats)
})

onBeforeUnmount(() => {
  window.removeEventListener('mail-unread-changed', fetchDomainStats)
})

function selectDomain(item) {
  changeDomain(item)
  router.push({name: 'email'})
}

function openGlobalInbox() {
  setGlobalMailbox(true)
  router.push({name: 'email'})
}

function openSpam() {
  setGlobalMailbox(true, '\u5783\u573e\u90ae\u7bb1')
  router.push({name: 'spam'})
}

function openOther() {
  setGlobalMailbox(true, '其他通知')
  router.push({name: 'other'})
}

function openWriter() {
  uiStore.writerRef?.open?.()
}

function openSubAccount() {
  router.push({name: 'sub-account'})
}

function ensureMailboxState(refreshList = true) {
  if (!userStore.user?.account?.accountId) return

  if (!accountStore.currentAccountId) {
    setGlobalMailbox(refreshList)
    return
  }

  if (accountStore.currentDomain && !findDomain(accountStore.currentDomain)) {
    setGlobalMailbox(refreshList)
  }
}

function setGlobalMailbox(refreshList = true, label = '\u603b\u6536\u4ef6\u7bb1') {
  const baseAccount = userStore.user?.account || {}
  const accountId = baseAccount.accountId || accountStore.currentAccountId
  if (!accountId) return

  const changed = accountStore.currentDomain !== '' || accountStore.currentAccountId !== accountId || accountStore.currentAccount?.allReceive !== 1
  accountStore.currentDomain = ''
  accountStore.currentAccountId = accountId
  accountStore.currentAccount = {
    ...baseAccount,
    accountId,
    email: label,
    domain: '',
    allReceive: 1,
    domainMode: false
  }

  if (refreshList && changed) {
    emailStore.emailScroll?.refreshList?.()
    emailStore.spamScroll?.refreshList?.()
    emailStore.otherScroll?.refreshList?.()
  }
}

function changeDomain(item, refreshList = true) {
  if (!item?.domain || !item.accountId) return

  const changed = accountStore.currentDomain !== item.domain || accountStore.currentAccountId !== item.accountId
  accountStore.currentDomain = item.domain
  accountStore.currentAccountId = item.accountId
  accountStore.currentAccount = {
    ...(userStore.user.account || {}),
    accountId: item.accountId,
    email: item.label,
    domain: item.domain,
    allReceive: 1,
    domainMode: true
  }

  if (refreshList && changed) {
    emailStore.emailScroll?.refreshList?.()
    emailStore.spamScroll?.refreshList?.()
    emailStore.otherScroll?.refreshList?.()
    emailStore.sendScroll?.refreshList?.()
  }
}

function fetchDomainStats() {
  if (!userStore.user?.account?.accountId) return
  emailDomainStats().then(data => {
    const list = Array.isArray(data) ? data : (data?.domains || [])
    const fallbackGlobalUnread = list.reduce((total, item) => total + Number(item.unreadCount || 0), 0)
    globalInboxUnread.value = Number(data?.globalInboxUnread ?? fallbackGlobalUnread)
    spamUnread.value = Number(data?.spamUnread || 0)
    otherUnread.value = Number(data?.otherUnread || 0)
    domainStats.value = Object.fromEntries((list || []).map(item => [
      cleanDomain(item.domain),
      Number(item.unreadCount || 0)
    ]))
  }).catch(err => {
    console.error('鑾峰彇鍩熷悕鏈缁熻澶辫触:', err)
  })
}

function findDomain(domain) {
  const clean = cleanDomain(domain)
  return domainAccounts.value.find(item => item.domain === clean)
}

function domainItemClass(domain) {
  return {
    'domain-current': accountStore.currentDomain === domain,
    'choose-item': route.meta.name === 'email' && accountStore.currentDomain === domain
  }
}

function formatUnread(count) {
  return count > 99 ? '99+' : count
}

function cleanDomain(domain) {
  return String(domain || '').replace(/^@/, '').trim().toLowerCase()
}
</script>

<style lang="scss" scoped>
.lq-side {
  width: 232px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--lq-side);
  border-right: 1px solid var(--lq-border);
  color: var(--lq-text);
}
.lq-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 18px;
  flex: none;
}
.lq-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--lq-primary);
  color: var(--lq-on-primary);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 15px;
}
.lq-brand-name {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lq-account {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 18px 12px;
  color: var(--lq-muted);
  font-size: 12px;
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.lq-compose {
  margin: 0 12px 10px;
  height: 38px;
  border-radius: 7px;
  background: var(--lq-primary);
  color: var(--lq-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 500;
  cursor: pointer;
  flex: none;
  &:hover { opacity: .88; }
}
.lq-scroll {
  flex: 1;
  min-height: 0;
}
.lq-folders {
  padding: 4px 0 16px;
  a {
    display: flex;
    align-items: center;
    gap: 11px;
    height: 38px;
    margin: 2px 10px;
    padding: 0 12px;
    border-radius: 6px;
    color: var(--lq-muted);
    cursor: pointer;
    user-select: none;
    font-size: 14px;
    .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--lq-text); }
    .c { color: var(--lq-muted); font-size: 12px; font-weight: 500; }
    &:hover { background: var(--lq-hover); }
    &.on { background: var(--lq-active); color: var(--lq-text); .n { font-weight: 600; } }
    &.sub { height: 34px; padding-left: 40px; font-size: 13px; }
  }
  .arrow { transition: transform .15s; transform: rotate(-90deg); &.open { transform: rotate(0); } }
}
.lq-group {
  margin: 16px 22px 6px;
  font-size: 12px;
  color: var(--lq-muted);
}
</style>
