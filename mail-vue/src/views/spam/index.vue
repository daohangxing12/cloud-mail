<template>
  <div class="mail-workspace">
    <section class="mail-list-pane">
      <div class="mail-search-bar">
        <el-input
            v-model="params.keyword"
            clearable
            placeholder="搜索垃圾邮箱"
            @keyup.enter="refreshSearch"
            @clear="refreshSearch"
        >
          <template #prefix>
            <Icon icon="iconoir:search" width="18" height="18"/>
          </template>
        </el-input>
      </div>
      <emailScroll ref="scroll"
                   :cancel-success="cancelStar"
                   :star-success="addStar"
                   :getEmailList="getEmailList"
                   :emailDelete="emailDelete"
                   :star-add="starAdd"
                   :star-cancel="starCancel"
                   :time-sort="params.timeSort"
                   :email-read="emailRead"
                   :show-unread="true"
                   :selected-email-id="selectedEmail?.emailId || 0"
                   type="spam"
                   actionLeft="4px"
                   @jump="jumpContent"
      >
        <template #first>
          <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
                v-if="params.timeSort === 0" width="28" height="28"/>
          <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
                width="28" height="28"/>
        </template>
      </emailScroll>
    </section>
    <section class="mail-detail-pane">
      <ContentPanel
          v-if="selectedEmail"
          :key="selectedEmail.emailId"
          embedded
          @close="closeDetail"
      />
      <div v-else class="detail-empty">
        <el-empty description="点击左侧邮件查看详情"/>
      </div>
    </section>
  </div>
</template>

<script setup>
import {defineOptions, onMounted, reactive, ref, watch} from 'vue'
import {Icon} from '@iconify/vue'
import emailScroll from '@/components/email-scroll/index.vue'
import ContentPanel from '@/views/content/index.vue'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {useUserStore} from '@/store/user.js'
import {emailDelete, emailList, emailRead} from '@/request/email.js'
import {starAdd, starCancel} from '@/request/star.js'
import {debounce} from 'lodash-es'

defineOptions({
  name: 'spam'
})

const emailStore = useEmailStore()
const accountStore = useAccountStore()
const userStore = useUserStore()
const scroll = ref({})
const selectedEmail = ref(null)
const params = reactive({
  timeSort: 0,
  keyword: ''
})

onMounted(() => {
  setGlobalSpamAccount()
  emailStore.spamScroll = scroll
})

watch(() => [accountStore.currentAccountId, userStore.user?.account?.accountId], () => {
  closeDetail()
  scroll.value.refreshList?.()
})

watch(() => params.keyword, debounce(() => {
  refreshSearch()
}, 450))

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  selectedEmail.value = email
}

function closeDetail() {
  selectedEmail.value = null
}

function refreshSearch() {
  closeDetail()
  scroll.value.refreshList?.()
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  setGlobalSpamAccount()
  const accountId = accountStore.currentAccountId || userStore.user?.account?.accountId
  const allReceive = 1
  const domain = ''
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0, domain, 1, params.keyword).then(data => {
    data.latestEmail.reqAccountId = accountId
    data.latestEmail.allReceive = allReceive
    return data
  })
}

function setGlobalSpamAccount() {
  const baseAccount = userStore.user?.account || {}
  const accountId = baseAccount.accountId || accountStore.currentAccountId
  if (!accountId) return

  accountStore.currentDomain = ''
  accountStore.currentAccountId = accountId
  accountStore.currentAccount = {
    ...baseAccount,
    accountId,
    email: '垃圾邮箱',
    domain: '',
    allReceive: 1,
    domainMode: false
  }
}
</script>

<style scoped>
.icon {
  cursor: pointer;
}

.mail-workspace {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  overflow: hidden;
  background: var(--el-bg-color);
}

.mail-list-pane {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  border-right: 1px solid var(--el-border-color);
  overflow: hidden;
}

.mail-search-bar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.mail-detail-pane {
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}

.detail-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1024px) {
  .mail-workspace {
    grid-template-columns: 1fr;
  }

  .mail-detail-pane {
    display: none;
  }
}
</style>
