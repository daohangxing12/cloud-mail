<template>
  <div class="mail-preview" :class="{ empty: !currentEmail.emailId }">
    <template v-if="currentEmail.emailId">
      <div class="preview-toolbar">
        <Icon class="icon mobile-back" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="emit('close')" />
        <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete" />
        <span class="star" v-if="showStar">
          <Icon class="icon" @click="changeStar" v-if="currentEmail.isStar" icon="fluent-color:star-16" width="20" height="20" />
          <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18" />
        </span>
        <el-button
            v-if="currentEmail.sendEmail"
            v-perm="'setting:set'"
            size="small"
            type="warning"
            plain
            :loading="blockLoading"
            @click="handleBlockSender"
        >拉黑发件人</el-button>
        <Icon class="icon" v-if="showReply" v-perm="'email:send'" @click="openReply" icon="la:reply" width="21" height="21" />
        <Icon class="icon" v-if="showReply" v-perm="'email:send'" @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
      </div>
      <el-scrollbar class="preview-scrollbar">
        <div class="preview-container">
          <div class="email-title">{{ currentEmail.subject || '(' + t('noSubject') + ')' }}</div>
          <div class="email-meta">
            <div class="meta-row">
              <span class="meta-label">{{ t('from') }}</span>
              <span class="meta-value">
                <span class="sender-name">{{ currentEmail.name }}</span>
                <span>&lt;{{ currentEmail.sendEmail }}&gt;</span>
              </span>
            </div>
            <div class="meta-row">
              <span class="meta-label">{{ t('recipient') }}</span>
              <span class="meta-value">{{ formatReceive(currentEmail) }}</span>
            </div>
            <div class="meta-date">{{ formatDetailDate(currentEmail.createTime) }}</div>
            <el-alert v-if="currentEmail.status === 3" :closable="false" :title="toMessage(currentEmail.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="currentEmail.status === 4" :closable="false" :title="t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="currentEmail.status === 5" :closable="false" :title="t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <div class="message-stage" :class="{ 'plain-stage': !currentEmail.content }">
            <ShadowHtml class="shadow-html" :html="formatImage(currentEmail.content)" v-if="currentEmail.content" />
            <pre v-else class="email-text">{{ currentEmail.text }}</pre>
          </div>
          <div class="att" v-if="attList.length > 0">
            <div class="att-title">
              <span>{{ t('attachments') }}</span>
              <span>{{ t('attCount', { total: attList.length }) }}</span>
            </div>
            <div class="att-box">
              <div class="att-item" v-for="att in attList" :key="att.attId || att.key">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">{{ att.filename }}</div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)" />
                  <a :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
      <el-image-viewer
          v-if="showPreview"
          :url-list="srcList"
          show-progress
          @close="showPreview = false"
      />
    </template>
    <div v-else class="empty-preview">
      <Icon icon="fluent:mail-read-20-regular" width="52" height="52" />
      <div class="empty-title">选择一封邮件查看详情</div>
      <div class="empty-desc">左侧列表保留快速筛选，右侧会像 SmarterMail 一样展示完整邮件内容。</div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ShadowHtml from '@/components/shadow-html/index.vue'
import { emailBlockSender, emailDelete, emailRead } from '@/request/email.js'
import { allEmailDelete } from '@/request/all-email.js'
import { starAdd, starCancel } from '@/request/star.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'
import { formatDetailDate } from '@/utils/day.js'
import { cvtR2Url, toOssDomain } from '@/utils/convert.js'
import { formatBytes, getExtName } from '@/utils/file-utils.js'
import { getIconByName } from '@/utils/icon-utils.js'
import { EmailUnreadEnum } from '@/enums/email-enum.js'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  email: {
    type: Object,
    default: null
  },
  delType: {
    type: String,
    default: 'logic'
  },
  showStar: {
    type: Boolean,
    default: true
  },
  showReply: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['close', 'deleted', 'blocked', 'read'])
const { t } = useI18n()
const uiStore = useUiStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore()
const showPreview = ref(false)
const blockLoading = ref(false)
const srcList = reactive([])

const currentEmail = computed(() => props.email || {})
const attList = computed(() => currentEmail.value.attList || [])

watch(
  () => currentEmail.value.emailId,
  () => markRead(),
  { immediate: true }
)

function markRead() {
  const email = currentEmail.value
  if (!props.showUnread || !email.emailId || email.unread !== EmailUnreadEnum.UNREAD) return
  email.unread = EmailUnreadEnum.READ
  emailRead([email.emailId]).finally(() => {
    window.dispatchEvent(new CustomEvent('mail-unread-changed'))
    emit('read', email)
  })
}

function openReply() {
  uiStore.writerRef.openReply(currentEmail.value)
}

function openForward() {
  uiStore.writerRef.openForward(currentEmail.value)
}

function toMessage(message) {
  if (!message) return ''
  try {
    return JSON.parse(message).message || ''
  } catch (e) {
    return message
  }
}

function formatImage(content) {
  const domain = settingStore.settings.r2Domain
  return String(content || '').replace(/{{domain}}/g, toOssDomain(domain) + '/')
}

function formatReceive(email) {
  if (!email.recipient) return email.toEmail || ''
  try {
    const recipient = JSON.parse(email.recipient)
    return recipient.map(item => item.address).join(', ')
  } catch (e) {
    return email.toEmail || email.recipient
  }
}

function showImage(key) {
  if (!isImage(key)) return
  srcList.length = 0
  srcList.push(cvtR2Url(key))
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'jfif'].includes(getExtName(filename))
}

function changeStar() {
  const email = currentEmail.value
  if (!email.emailId) return
  if (email.isStar) {
    email.isStar = 0
    starCancel(email.emailId).then(() => {
      emailStore.cancelStarEmailId = email.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.emailId])
    }).catch(() => {
      email.isStar = 1
    })
    return
  }
  email.isStar = 1
  starAdd(email.emailId).then(() => {
    emailStore.addStarEmailId = email.emailId
    setTimeout(() => emailStore.addStarEmailId = 0)
    emailStore.starScroll?.addItem(email)
  }).catch(() => {
    email.isStar = 0
  })
}

function handleDelete() {
  const email = currentEmail.value
  if (!email.emailId) return
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const request = props.delType === 'all' ? allEmailDelete : emailDelete
    request([email.emailId]).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = [email.emailId]
      emit('deleted', email)
    })
  })
}

function handleBlockSender() {
  const email = currentEmail.value
  if (!email.sendEmail || blockLoading.value) return
  ElMessageBox.confirm(`确认拉黑 ${email.sendEmail}，并把历史同发件人邮件移入垃圾箱吗？`, '拉黑发件人', {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    blockLoading.value = true
    emailBlockSender(email.emailId).then((data) => {
      ElMessage({
        message: `已拉黑 ${data.sender}，移动 ${data.moved || 0} 封邮件到垃圾箱`,
        type: 'success',
        plain: true
      })
      email.isSpam = 1
      emailStore.deleteIds = [email.emailId]
      emailStore.emailScroll?.refreshList?.()
      emailStore.spamScroll?.refreshList?.()
      emit('blocked', email)
    }).finally(() => {
      blockLoading.value = false
    })
  })
}
</script>

<style scoped lang="scss">
.mail-preview {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: var(--el-bg-color);
}

.preview-toolbar {
  min-height: 42px;
  padding: 7px 16px;
  display: flex;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--el-border-color);

  .icon {
    cursor: pointer;
  }

  .star {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
  }
}

.mobile-back {
  display: none;
}

.preview-scrollbar {
  height: 100%;
  width: 100%;
}

.preview-container {
  min-height: 100%;
  padding: 20px 28px 38px;
}

.email-title {
  font-size: 22px;
  line-height: 1.3;
  font-weight: 700;
  margin-bottom: 14px;
}

.email-meta {
  border-bottom: 1px solid var(--light-border-color);
  padding-bottom: 12px;
  margin-bottom: 16px;
  color: var(--regular-text-color);
}

.meta-row {
  display: flex;
  gap: 12px;
  margin-bottom: 7px;
  line-height: 1.45;
}

.meta-label {
  flex: 0 0 auto;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.meta-value {
  min-width: 0;
  word-break: break-word;
}

.sender-name {
  margin-right: 6px;
}

.meta-date {
  margin-top: 8px;
}

.email-msg {
  margin-top: 10px;
  max-width: 560px;
}

.message-stage {
  min-height: 620px;
  padding: 30px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: color-mix(in srgb, var(--el-fill-color-light) 70%, transparent);
  overflow: auto;
}

.plain-stage {
  justify-content: flex-start;
}

.shadow-html {
  max-width: 100%;
}

.email-text {
  width: 100%;
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.att {
  margin-top: 24px;
  margin-bottom: 24px;
  border: 1px solid var(--light-border-color);
  padding: 14px;
  border-radius: 8px;
  width: fit-content;
  max-width: 100%;
}

.att-title {
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  gap: 20px;

  span:first-child {
    font-weight: 700;
  }
}

.att-box {
  min-width: min(410px, calc(100vw - 60px));
  max-width: 600px;
  display: grid;
  gap: 12px;
}

.att-item {
  cursor: pointer;
  background: var(--light-ill);
  padding: 6px 8px;
  border-radius: 5px;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
}

.att-icon {
  display: grid;
}

.att-name {
  margin-left: 8px;
  margin-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

.att-size,
.opt-icon,
.opt-icon a {
  color: var(--secondary-text-color);
}

.opt-icon {
  padding-left: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty-preview {
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  color: var(--secondary-text-color);
  text-align: center;
  padding: 30px;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.empty-desc {
  max-width: 420px;
  line-height: 1.7;
}

@media (max-width: 1024px) {
  .mobile-back {
    display: inline-flex;
  }

  .preview-container {
    padding: 16px 16px 28px;
  }

  .message-stage {
    min-height: 420px;
    padding: 16px;
  }
}
</style>
