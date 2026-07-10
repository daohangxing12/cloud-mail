<template>
  <div class="account-box">
    <div class="head-opt">
      <span class="head-title">域名邮箱</span>
      <div class="head-icons">
        <Icon
            v-if="hasPerm('user:query')"
            class="icon"
            icon="fluent:mail-inbox-add-20-regular"
            width="21"
            height="21"
            title="管理子邮箱"
            @click="openSubAccounts()"
        />
        <Icon class="icon" icon="ion:reload" width="18" height="18" title="刷新" @click="refresh"/>
      </div>
    </div>
    <el-scrollbar class="scrollbar">
      <div class="global-folders">
        <div
            class="global-row"
            :class="globalFolderActive('email')"
            @click="openGlobalInbox"
        >
          <Icon icon="hugeicons:mailbox-01" width="19" height="19"/>
          <span>收件箱</span>
          <span v-if="globalInboxUnread > 0" class="folder-count">{{ formatUnread(globalInboxUnread) }}</span>
        </div>
        <div
            class="global-row"
            :class="globalFolderActive('spam')"
            @click="openSpam"
        >
          <Icon icon="mdi:email-alert-outline" width="19" height="19"/>
          <span>垃圾邮箱</span>
          <span v-if="spamUnread > 0" class="folder-count">{{ formatUnread(spamUnread) }}</span>
        </div>
      </div>

      <div
          v-for="item in domainAccounts"
          :key="item.domain"
          class="domain-group"
          :class="domainActive(item.domain)"
      >
        <div class="domain-head" @click="selectFolder(item, 'email')">
          <Icon icon="mingcute:down-small-fill" width="18" height="18"/>
          <span class="domain-name">{{ item.label }}</span>
          <span v-if="item.unreadCount > 0" class="domain-badge">{{ formatUnread(item.unreadCount) }}</span>
        </div>

        <div class="folder-list">
          <div class="folder-row" :class="folderActive(item.domain, 'email')" @click="selectFolder(item, 'email')">
            <Icon icon="fluent:mail-inbox-20-regular" width="19" height="19"/>
            <span>收件箱</span>
            <span v-if="item.unreadCount > 0" class="folder-count">{{ formatUnread(item.unreadCount) }}</span>
          </div>
          <div
              v-if="hasPerm('user:query')"
              class="folder-row"
              :class="folderActive(item.domain, 'sub-account')"
              @click="selectFolder(item, 'sub-account')"
          >
            <Icon icon="fluent:mail-inbox-add-20-regular" width="19" height="19"/>
            <span>子邮箱管理</span>
          </div>
        </div>

        <div class="domain-tools">
          <button type="button" title="复制域名" @click.stop="copyDomain(item.domain)">
            <Icon icon="fluent:copy-20-regular" width="17" height="17"/>
          </button>
          <button
              v-if="hasPerm('user:query')"
              type="button"
              title="管理子邮箱"
              @click.stop="selectFolder(item, 'sub-account')"
          >
            <Icon icon="fluent:settings-24-regular" width="17" height="17"/>
          </button>
        </div>
      </div>

      <div class="empty" v-if="domainAccounts.length === 0">
        <el-empty description="暂无域名"/>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {Icon} from '@iconify/vue'
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import router from '@/router/index.js'
import {useSettingStore} from '@/store/setting.js'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {useUserStore} from '@/store/user.js'
import {hasPerm} from '@/perm/perm.js'
import {emailDomainStats} from '@/request/email.js'

const route = useRoute()
const userStore = useUserStore()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore()
const domainStats = ref({})
const globalInboxUnread = ref(0)
const spamUnread = ref(0)

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
    () => [route.name, route.query.domain, domainAccounts.value.map(item => item.domain).join(',')],
    () => {
      if (route.name !== 'sub-account' || !route.query.domain) return
      const domain = cleanDomain(route.query.domain)
      const item = domainAccounts.value.find(row => row.domain === domain)
      if (item) {
        changeDomain(item, false)
      }
    },
    {immediate: true}
)

onMounted(() => {
  window.addEventListener('mail-unread-changed', fetchDomainStats)
})

onBeforeUnmount(() => {
  window.removeEventListener('mail-unread-changed', fetchDomainStats)
})

function selectFolder(item, name) {
  if (!item?.domain) return
  changeDomain(item, name === 'email')

  if (name === 'sub-account') {
    router.push({name: 'sub-account', query: {domain: item.domain}})
    return
  }

  router.push({name})
}

function openGlobalInbox() {
  setGlobalMailbox(true)
  router.push({name: 'email'})
}

function openSpam() {
  setGlobalMailbox(true, '垃圾邮箱')
  router.push({name: 'spam'})
}

function ensureMailboxState(refreshList = true) {
  if (!userStore.user?.account?.accountId) return

  if (!accountStore.currentAccountId) {
    setGlobalMailbox(refreshList)
    return
  }

  if (accountStore.currentDomain && !domainAccounts.value.some(item => item.domain === accountStore.currentDomain)) {
    setGlobalMailbox(refreshList)
  }
}

function setGlobalMailbox(refreshList = true, label = '收件箱') {
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
  }
}

function changeDomain(item, refreshList = true) {
  if (!item?.domain || !item.accountId) return

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

  if (refreshList) {
    emailStore.emailScroll?.refreshList?.()
  }
}

function refresh() {
  const current = domainAccounts.value.find(item => item.domain === accountStore.currentDomain) || domainAccounts.value[0]
  fetchDomainStats()
  changeDomain(current)
}

async function copyDomain(domain) {
  try {
    await navigator.clipboard.writeText(domain)
    ElMessage({message: '复制成功', type: 'success', plain: true})
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage({message: '复制失败', type: 'error', plain: true})
  }
}

function openSubAccounts(domain = '') {
  const currentDomain = domain || accountStore.currentDomain || domainAccounts.value[0]?.domain || ''
  router.push({name: 'sub-account', query: currentDomain ? {domain: currentDomain} : {}})
}

function fetchDomainStats() {
  if (!userStore.user?.account?.accountId) return
  emailDomainStats().then(data => {
    const list = Array.isArray(data) ? data : (data?.domains || [])
    const fallbackGlobalUnread = list.reduce((total, item) => total + Number(item.unreadCount || 0), 0)
    globalInboxUnread.value = Number(data?.globalInboxUnread ?? fallbackGlobalUnread)
    spamUnread.value = Number(data?.spamUnread || 0)
    domainStats.value = Object.fromEntries(list.map(item => [
      cleanDomain(item.domain),
      Number(item.unreadCount || 0)
    ]))
  }).catch(err => {
    console.error('获取域名未读统计失败:', err)
  })
}

function domainActive(domain) {
  return accountStore.currentDomain === domain ? 'domain-active' : ''
}

function folderActive(domain, name) {
  return accountStore.currentDomain === domain && route.name === name ? 'folder-active' : ''
}

function globalFolderActive(name) {
  if (name === 'email') {
    return route.name === 'email' && !accountStore.currentDomain ? 'folder-active' : ''
  }
  return route.name === name ? 'folder-active' : ''
}

function formatUnread(count) {
  return count > 99 ? '99+' : count
}

function cleanDomain(domain) {
  return String(domain || '').replace(/^@/, '').trim().toLowerCase()
}
</script>

<style scoped lang="scss">
.account-box {
  border-right: 1px solid var(--el-border-color) !important;
  background: linear-gradient(180deg, var(--el-bg-color), var(--el-fill-color-lighter));
  height: 100%;
  overflow: hidden;

  .head-opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 38px;
    box-shadow: var(--header-actions-border);
    padding-left: 12px;
    padding-right: 12px;

    .head-title {
      font-size: 13px;
      font-weight: 800;
      color: var(--el-text-color-regular);
    }

    .head-icons {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .icon {
      cursor: pointer;
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 38px);
    overflow: auto;

    @media (max-width: 767px) {
      height: calc(100% - 98px);
    }
  }
}

.domain-group {
  position: relative;
  margin: 8px 8px 10px;
  padding: 6px 0 8px;
  border-radius: 10px;
  color: var(--el-text-color-regular);
}

.global-folders {
  margin: 8px;
  padding: 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
}

.global-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.global-row + .global-row {
  margin-top: 3px;
}

.domain-active {
  background: color-mix(in srgb, var(--el-color-primary) 9%, transparent);
}

.domain-head {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 10px;
  cursor: pointer;
  font-weight: 800;
}

.domain-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.domain-badge,
.folder-count {
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.folder-list {
  display: grid;
  gap: 2px;
  padding: 2px 5px 0 24px;
}

.folder-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;

  span:nth-child(2) {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.global-row:hover,
.folder-row:hover,
.folder-active {
  background: var(--choose-account-background);
  color: var(--el-color-primary);
  font-weight: 700;
}

.domain-tools {
  display: flex;
  gap: 4px;
  padding: 4px 10px 0 52px;

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;
  }

  button:hover {
    background: var(--el-fill-color-light);
    color: var(--el-color-primary);
  }
}

.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>
