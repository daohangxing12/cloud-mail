<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title">
        <Icon icon="mdi:email-outline" width="24" height="24" />
        <div>{{ settingStore.settings.title }}</div>
      </div>
      <el-menu
          :collapse="false"
          :default-openeds="['domain-inbox']"
          text-color="#fff"
          active-text-color="#fff"
          style="margin-top: 10px"
      >
        <el-menu-item
            @click="openGlobalInbox"
            index="email-global"
            class="mail-menu-item"
            :class="route.meta.name === 'email' && !accountStore.currentDomain ? 'choose-item' : ''"
        >
          <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
          <span class="menu-name">收件箱</span>
          <span v-if="globalInboxUnread > 0" class="domain-badge">{{ formatUnread(globalInboxUnread) }}</span>
        </el-menu-item>
        <el-sub-menu
            index="domain-inbox"
            class="inbox-domain-menu"
            :class="route.meta.name === 'email' && accountStore.currentDomain ? 'choose-sub-menu' : ''"
        >
          <template #title>
            <Icon icon="fluent:mail-multiple-20-regular" width="20" height="20" />
            <span class="menu-name inbox-title">域名收件箱</span>
          </template>
          <el-menu-item
              v-for="item in domainAccounts"
              :key="item.domain"
              class="domain-item"
              :class="domainItemClass(item.domain)"
              :index="`domain-${item.domain}`"
              @click="selectDomain(item)"
          >
            <Icon icon="mdi:email-outline" width="17" height="17" />
            <span class="domain-name">{{ item.label }}</span>
            <span v-if="item.unreadCount > 0" class="domain-badge">{{ formatUnread(item.unreadCount) }}</span>
          </el-menu-item>
          <el-menu-item v-if="domainAccounts.length === 0" class="domain-item empty-domain" index="domain-empty" disabled>
            <span>暂无域名</span>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <Icon icon="cil:send" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{ $t('sent') }}</span>
        </el-menu-item>
        <el-menu-item @click="openSpam" index="spam"
                      class="mail-menu-item"
                      :class="route.meta.name === 'spam' ? 'choose-item' : ''">
          <Icon icon="mdi:email-alert-outline" width="21" height="21" />
          <span class="menu-name">垃圾邮箱</span>
          <span v-if="spamUnread > 0" class="domain-badge">{{ formatUnread(spamUnread) }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <Icon icon="ep:document" width="19" height="19" />
          <span class="menu-name" style="margin-left: 22px">{{ $t('drafts') }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <Icon icon="solar:star-line-duotone" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{ $t('starred') }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <Icon icon="fluent:settings-48-regular" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{ $t('settings') }}</span>
        </el-menu-item>
        <div class="manage-title" v-perm="['all-email:query','user:query','setting:query']">
          <div>{{ $t('manage') }}</div>
        </div>
        <el-menu-item @click="router.push({name: 'asset-overview'})" index="asset-overview" v-perm="'user:query'"
                      :class="route.meta.name === 'asset-overview' ? 'choose-item' : ''">
          <Icon icon="fluent:data-pie-20-regular" width="24" height="24" />
          <span class="menu-name" style="margin-left: 18px">资产概览</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'email-assets'})" index="email-assets" v-perm="'user:query'"
                      :class="route.meta.name === 'email-assets' ? 'choose-item' : ''">
          <Icon icon="fluent:database-plug-connected-20-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 20px">邮箱资产</span>
        </el-menu-item>
        <el-menu-item @click="openSubAccount" index="sub-account" v-perm="'user:query'"
                      :class="route.meta.name === 'sub-account' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-inbox-add-20-regular" width="21" height="21" />
          <span class="menu-name" style="margin-left: 20px">子邮箱管理</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="route.meta.name === 'sys-setting' ? 'choose-item' : ''">
          <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" style="margin-left: 2px" />
          <span class="menu-name" style="margin-left: 22px">{{ $t('SystemSettings') }}</span>
        </el-menu-item>
      </el-menu>
    </div>
  </el-scrollbar>
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
import {emailDomainStats} from '@/request/email.js'

const settingStore = useSettingStore()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const userStore = useUserStore()
const route = useRoute()
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
  setGlobalMailbox(true, '垃圾邮箱')
  router.push({name: 'spam'})
}

function openSubAccount() {
  router.push({
    name: 'sub-account',
    query: accountStore.currentDomain ? {domain: accountStore.currentDomain} : {}
  })
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
    domainStats.value = Object.fromEntries(list.map(item => [
      cleanDomain(item.domain),
      Number(item.unreadCount || 0)
    ]))
  }).catch(err => {
    console.error('获取域名未读统计失败:', err)
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
.title {
  margin: 15px 10px;
  height: 45px;
  border-radius: 6px;
  display: flex;
  position: relative;
  font-size: 16px;
  font-weight: bold;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: #ffffff;
  background: linear-gradient(135deg, #1890ff, #3a80dd);
  transition: all 0.3s ease;
  max-width: 240px;
  padding: 0 10px;

  > div {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: calc(240px - 20px - 30px);
  }

  :deep(.el-icon) {
    flex-shrink: 0;
    font-size: 20px;
  }
}

.manage-title {
  margin-top: 10px;
  padding-left: 20px;
  color: #fff;
}

.el-menu-item {
  margin: 5px 10px !important;
  border-radius: 6px;
  height: 36px;
  padding: 10px !important;
}

.choose-item {
  font-weight: bold;
  background: rgba(255, 255, 255, 0.08) !important;
  backdrop-filter: blur(4px);
}

.choose-sub-menu :deep(.el-sub-menu__title) {
  font-weight: bold;
  background: rgba(255, 255, 255, 0.08) !important;
}

.mail-menu-item {
  display: grid !important;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.inbox-title {
  margin-left: 21px;
  flex: 1;
}

.domain-item {
  display: grid !important;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-top: 3px !important;
  margin-bottom: 3px !important;
  padding-left: 30px !important;
}

.domain-current:not(.choose-item) {
  background: rgba(255, 255, 255, 0.045) !important;
}

.domain-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.domain-badge {
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #1890ff;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.empty-domain {
  color: rgba(255, 255, 255, 0.45) !important;
}

@media (hover: hover) {
  .el-menu-item:hover,
  :deep(.el-sub-menu__title:hover) {
    background: rgba(255, 255, 255, 0.08) !important;
  }
}

.menu-name {
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

:deep(.el-scrollbar__wrap--hidden-default ) {
  background: var(--aside-backgound) !important;
}

:deep(.el-menu-item) {
  background: var(--aside-backgound);
}

:deep(.el-sub-menu__title) {
  margin: 5px 10px !important;
  border-radius: 6px;
  height: 36px;
  padding: 10px !important;
  color: #fff !important;
}

:deep(.el-sub-menu__title .el-sub-menu__icon-arrow) {
  color: #fff;
}

:deep(.el-menu) {
  background: var(--aside-backgound);
}

.el-menu {
  border-right: 0;
  width: 260px;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: #FFFFFF;
}
</style>
