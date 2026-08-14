<template>
  <div class="mail-workbench">
    <section class="mail-list-pane">
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
                   :compact-layout="true"
                   :selected-email-id="selectedEmail?.emailId || 0"
                   actionLeft="4px"
                   @jump="jumpContent"
      >
        <template #first>
          <el-input
              v-model.trim="params.keyword"
              clearable
              class="spam-search-input"
              placeholder="搜索邮箱/发件人/标题/正文"
              @keyup.enter="searchSpam"
              @clear="searchSpam"
          />
          <Icon class="icon" icon="iconoir:search" width="20" height="20" @click="searchSpam"/>
          <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
                v-if="params.timeSort === 0" width="28" height="28"/>
          <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
                width="28" height="28"/>
        </template>
      </emailScroll>
    </section>
    <section class="mail-preview-pane">
      <MailPreview
          :email="selectedEmail"
          del-type="logic"
          :show-unread="true"
          :show-star="true"
          :show-reply="true"
          @deleted="clearSelected"
          @blocked="clearSelected"
      />
    </section>
  </div>
</template>

<script setup>
import {defineOptions, onMounted, reactive, ref, watch} from 'vue'
import {Icon} from '@iconify/vue'
import router from '@/router/index.js'
import emailScroll from '@/components/email-scroll/index.vue'
import MailPreview from '@/components/mail-preview/index.vue'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {emailDelete, emailList, emailRead} from '@/request/email.js'
import {starAdd, starCancel} from '@/request/star.js'

defineOptions({
  name: 'spam'
})

const emailStore = useEmailStore()
const accountStore = useAccountStore()
const scroll = ref({})
const selectedEmail = ref(null)
const params = reactive({
  timeSort: 0,
  keyword: '',
})

onMounted(() => {
  emailStore.spamScroll = scroll
})

watch(() => [accountStore.currentAccountId, accountStore.currentDomain], () => {
  clearSelected()
  scroll.value.refreshList?.()
})

watch(() => emailStore.deleteIds, (ids) => {
  const deleteIds = Array.isArray(ids) ? ids : [ids]
  if (selectedEmail.value && deleteIds.includes(selectedEmail.value.emailId)) {
    clearSelected()
  }
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList()
}

function searchSpam() {
  clearSelected()
  scroll.value.refreshList()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  if (isThreePane()) {
    selectedEmail.value = email
    return
  }
  router.push('/message')
}

function clearSelected() {
  selectedEmail.value = null
}

function isThreePane() {
  return window.innerWidth > 1024
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId
  const allReceive = accountStore.currentAccount.allReceive
  const domain = accountStore.currentDomain
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0, domain, 1, params.keyword).then(data => {
    data.latestEmail.reqAccountId = accountId
    data.latestEmail.allReceive = allReceive
    return data
  })
}
</script>

<style scoped>
.mail-workbench {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  overflow: hidden;
  background: var(--el-bg-color);
}

.mail-list-pane,
.mail-preview-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.mail-preview-pane {
  background: var(--el-bg-color);
}

.icon {
  cursor: pointer;
}

.spam-search-input {
  width: 100%;
  max-width: 230px;
  height: 28px;
}

:deep(.spam-search-input .el-input__wrapper) {
  min-height: 28px;
}

@media (max-width: 1024px) {
  .mail-workbench {
    display: block;
  }

  .mail-list-pane {
    height: 100%;
  }

  .mail-preview-pane {
    display: none;
  }
}
</style>
