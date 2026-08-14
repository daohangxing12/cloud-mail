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
              class="inbox-search-input"
              placeholder="搜索邮箱/发件人/标题/正文"
              @keyup.enter="searchInbox"
              @clear="searchInbox"
          />
          <Icon class="icon" icon="iconoir:search" width="20" height="20" @click="searchInbox"/>
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
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import MailPreview from "@/components/mail-preview/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import {Icon} from "@iconify/vue";
import { useRoute } from 'vue-router'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
const selectedEmail = ref(null)
const params = reactive({
  timeSort: 0,
  keyword: '',
})

onMounted(() => {
  emailStore.emailScroll = scroll;
  latest()
})


watch(() => [accountStore.currentAccountId, accountStore.currentDomain], () => {
  clearSelected()
  scroll.value.refreshList();
})

watch(() => emailStore.deleteIds, (ids) => {
  const deleteIds = Array.isArray(ids) ? ids : [ids]
  if (selectedEmail.value && deleteIds.includes(selectedEmail.value.emailId)) {
    clearSelected()
  }
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function searchInbox() {
  clearSelected()
  scroll.value.refreshList();
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

const existIds = new Set();

async function latest() {
  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'email') {
      continue;
    }

    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && autoRefresh > 1 && !params.keyword) {
      try {
        const accountId = accountStore.currentAccountId
        const allReceive = scroll.value.latestEmail?.allReceive
        const domain = accountStore.currentDomain
        const curTimeSort = params.timeSort
        let list = []

        //确保发起请求时最后一个邮件是当前账号的,或者
        if (accountId === scroll.value.latestEmail?.reqAccountId) {
          list = await emailLatest(latestId, accountId, allReceive, domain, 0);
        }

        //确保请求回来后，账号没有切换，时间排序没有改变，全部邮件类型没变
        if (accountId === accountStore.currentAccountId && domain === accountStore.currentDomain && params.timeSort === curTimeSort && allReceive === accountStore.currentAccount.allReceive) {
          if (list.length > 0) {

            for (let email of list) {

              email.reqAccountId = accountId;
              email.allReceive = allReceive;

              if (!existIds.has(email.emailId)) {

                existIds.add(email.emailId)
                scroll.value.addItem(email)

                await sleep(50)
              }

            }

            window.dispatchEvent(new CustomEvent('mail-unread-changed'))
            window.dispatchEvent(new CustomEvent('mail-insights-changed'))

          }

        }
      } catch (e) {
        if (e.code === 401 || e.code === 403) {
          settingStore.settings.autoRefresh = 0;
        }
        console.error(e)
      }
    }
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  const domain = accountStore.currentDomain;
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0, domain, 0, params.keyword).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
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

.inbox-search-input {
  width: 100%;
  max-width: 230px;
  height: 28px;
}

:deep(.inbox-search-input .el-input__wrapper) {
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
