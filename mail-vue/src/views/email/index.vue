<!--
  STABLE GUARD:
  收件箱三栏阅读布局、顶部搜索、邮件列表头像/摘要、右侧详情是当前稳定功能。
  后续 AI/工程师禁止随意删除、重构回旧版或改成弹窗式详情。
  修改前必须先阅读 cloud-mail/AGENTS.md 和 STABLE_FEATURES_DO_NOT_BREAK.md。
-->
<template>
  <div class="mail-workspace">
    <section class="mail-list-pane">
      <div class="mail-search-bar">
        <el-input
            v-model="params.keyword"
            clearable
            placeholder="搜索邮件"
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
                   actionLeft="4px"
                    @jump="jumpContent"
                    @block-sender="blockSenderFromList"
                    @create-managed-mailbox="createManagedMailboxFromList"
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
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import emailScroll from "@/components/email-scroll/index.vue"
import ContentPanel from "@/views/content/index.vue";
import {emailBlockSender, emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {subAccountEnsureFromEmail} from "@/request/sub-account.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import {Icon} from "@iconify/vue";
import { useRoute } from 'vue-router'
import router from "@/router/index.js";
import {debounce} from 'lodash-es'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const userStore = useUserStore();
const scroll = ref({})
const selectedEmail = ref(null)
const params = reactive({
  timeSort: 0,
  keyword: '',
})

onMounted(() => {
  ensureGlobalAccount()
  emailStore.emailScroll = scroll;
  latest()
})


watch(() => [accountStore.currentAccountId, accountStore.currentDomain], () => {
  closeDetail()
  scroll.value.refreshList();
})

watch(() => params.keyword, debounce(() => {
  refreshSearch()
}, 450))

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  if (!isThreePane()) {
    router.push({name: 'content', query: { id: email.emailId }})
    return
  }
  selectedEmail.value = email
}

function closeDetail() {
  selectedEmail.value = null
}

function refreshSearch() {
  closeDetail()
  scroll.value.refreshList?.()
}

function isThreePane() {
  return window.innerWidth > 1024
}

function blockSenderFromList(email) {
  if (!email?.emailId || !email.sendEmail) return
  ElMessageBox.confirm(`确认拉黑 ${email.sendEmail}？以后这个发件人的邮件会进入垃圾邮箱。`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    emailBlockSender(email.emailId).then(() => {
      ElMessage({
        message: '已拉黑发件人，邮件已进入垃圾邮箱',
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = [email.emailId]
      if (selectedEmail.value?.emailId === email.emailId) {
        closeDetail()
      }
      window.dispatchEvent(new CustomEvent('mail-unread-changed'))
      window.dispatchEvent(new CustomEvent('mail-insights-changed'))
    })
  })
}

function createManagedMailboxFromList(email) {
  if (!email?.emailId) return
  const targetEmail = String(email.toEmail || '').trim().toLowerCase()
  ElMessageBox.confirm(`确认把 ${targetEmail || '当前收件邮箱'} 创建到资产/子邮箱管理，并准备接码 Token？`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    subAccountEnsureFromEmail({
      emailId: email.emailId,
      ensureToken: true
    }).then(data => {
      const actionText = {
        created: '已创建',
        restored: '已恢复',
        existing: '已存在'
      }[data.action] || '已处理'
      ElMessage({
        message: `${actionText}：${data.email}${data.generatedToken ? '，已生成接码 Token' : ''}`,
        type: 'success',
        plain: true
      })
      window.dispatchEvent(new CustomEvent('mail-insights-changed'))
    })
  })
}

const existIds = new Set();

async function latest() {
  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'email' || params.keyword) {
      continue;
    }

    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && autoRefresh > 1) {
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
  ensureGlobalAccount()
  const accountId =  accountStore.currentAccountId || userStore.user?.account?.accountId;
  const allReceive = accountStore.currentAccount?.allReceive ?? 1;
  const domain = accountStore.currentDomain;
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0, domain, 0, params.keyword).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

function ensureGlobalAccount() {
  if (accountStore.currentAccountId || !userStore.user?.account?.accountId) return

  const baseAccount = userStore.user.account
  accountStore.currentAccountId = baseAccount.accountId
  accountStore.currentAccount = {
    ...baseAccount,
    email: '收件箱',
    domain: '',
    allReceive: 1,
    domainMode: false
  }
}

</script>
<style>
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
