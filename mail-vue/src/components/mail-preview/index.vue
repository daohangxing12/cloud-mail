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
        <el-dropdown v-if="currentEmail.type !== 1" trigger="click" @command="handleMove">
          <el-button size="small" plain>移动到</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="0" :disabled="Number(currentEmail.isSpam || 0) === 0">收件箱</el-dropdown-item>
              <el-dropdown-item :command="2" :disabled="Number(currentEmail.isSpam || 0) === 2">其他通知</el-dropdown-item>
              <el-dropdown-item :command="1" :disabled="Number(currentEmail.isSpam || 0) === 1">垃圾邮件</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <Icon class="icon" v-if="showReply" v-perm="'email:send'" @click="openReply" icon="la:reply" width="21" height="21" />
        <Icon class="icon" v-if="showReply" v-perm="'email:send'" @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
      </div>
      <el-scrollbar class="preview-scrollbar">
        <div class="preview-container">
          <div class="email-title">{{ currentEmail.subject || '(' + t('noSubject') + ')' }}</div>
          <div class="email-meta">
            <SenderAvatar class="lq-header-avatar" :email="currentEmail.sendEmail" :name="currentEmail.name" :size="40"/>
            <div class="lq-envelope">
              <div class="meta-row lq-sender-line">
                <span class="meta-label">{{ t('from') }}</span>
                <span class="meta-value">
                  <span class="sender-name">{{ currentEmail.name }}</span>
                  <span class="lq-addr">&lt;{{ currentEmail.sendEmail }}&gt;</span>
                </span>
                <span class="meta-date">{{ formatDetailDate(currentEmail.createTime) }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">{{ t('recipient') }}</span>
                <span class="meta-value">{{ formatReceive(currentEmail) }}</span>
              </div>
            <el-alert v-if="currentEmail.status === 3" :closable="false" :title="toMessage(currentEmail.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="currentEmail.status === 4" :closable="false" :title="t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="currentEmail.status === 5" :closable="false" :title="t('delayed')" class="email-msg" type="warning" show-icon />
            </div>
          </div>
          <div class="lq-translate" v-if="tr.show">
            <span class="lq-translate-icon">文</span>
            <span class="lq-translate-info">{{ tr.busy ? tr.progress : (tr.done ? '已翻译成' + LANGS[tr.target] : '此邮件可能为' + LANGS[tr.source]) }}</span>
            <el-button v-if="!tr.done" size="small" type="primary" :loading="tr.busy" @click="translate">翻译成{{ LANGS[tr.target] }}</el-button>
            <el-button v-else size="small" @click="restoreOriginal">查看原文</el-button>
            <el-dropdown trigger="click" :hide-on-click="false">
              <span class="lq-translate-more">⋯</span>
              <template #dropdown>
                <div class="lq-translate-menu">
                  <label>邮件语言</label>
                  <el-select v-model="tr.source" size="small" @change="onLangChange">
                    <el-option v-for="(name, code) in LANGS" :key="code" :label="name" :value="code"/>
                  </el-select>
                  <label>翻译成</label>
                  <el-select v-model="tr.target" size="small" @change="onLangChange">
                    <el-option v-for="(name, code) in LANGS" :key="code" :label="name" :value="code"/>
                  </el-select>
                </div>
              </template>
            </el-dropdown>
          </div>
          <div class="message-stage" :class="{ 'plain-stage': !currentEmail.content }">
            <ShadowHtml ref="shadowRef" class="shadow-html" :html="formatImage(currentEmail.content)" v-if="currentEmail.content" />
            <pre v-else class="email-text">{{ tr.plain ?? currentEmail.text }}</pre>
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

    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ShadowHtml from '@/components/shadow-html/index.vue'
import SenderAvatar from '@/components/sender-avatar/index.vue'
import { emailBlockSender, emailDelete, emailMoveFolder, emailRead, emailTranslate } from '@/request/email.js'
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

// ===== 邮件翻译（对应原 VPS 的 flygw_translate）=====
const LANGS = {zh: '中文', en: '英语', vi: '越南语', ja: '日语', ko: '韩语', th: '泰语', id: '印尼语', ms: '马来语', es: '西班牙语', fr: '法语', de: '德语', pt: '葡萄牙语', it: '意大利语', ru: '俄语', ar: '阿拉伯语', tr: '土耳其语', hi: '印地语'}
const shadowRef = ref(null)
const tr = reactive({show: false, source: 'en', target: 'zh', busy: false, done: false, progress: '', plain: null})
let changed = []
// 放在 tr 定义之后，避免立即执行时 tr 还没初始化
watch(() => [currentEmail.value.emailId, currentEmail.value.content, currentEmail.value.text], () => resetTranslate(), { immediate: true })

function readTarget() {
  try { const v = localStorage.getItem('mail-translate-target'); if (LANGS[v]) return v } catch (e) {}
  return 'zh'
}

// 按文字特征粗略判断邮件语言（拉丁字母默认英语，可在 ⋯ 里改）
function detectLang(text) {
  const t = String(text || '').slice(0, 4000)
  const count = (re) => (t.match(re) || []).length
  const letters = count(/[\p{L}]/gu) || 1
  if (count(/[\u3040-\u30ff]/g) > 5) return 'ja'
  if (count(/[\uac00-\ud7af]/g) / letters > 0.2) return 'ko'
  if (count(/[\u4e00-\u9fff]/g) / letters > 0.3) return 'zh'
  if (count(/[\u0e00-\u0e7f]/g) / letters > 0.2) return 'th'
  if (count(/[\u0600-\u06ff]/g) / letters > 0.2) return 'ar'
  if (count(/[\u0400-\u04ff]/g) / letters > 0.2) return 'ru'
  if (count(/[\u0900-\u097f]/g) / letters > 0.2) return 'hi'
  if (count(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi) > 5) return 'vi'
  if (count(/[a-z]/gi) / letters > 0.5) return 'en'
  return ''
}

function bodyText() {
  const email = currentEmail.value
  if (email.text) return email.text
  return String(email.content || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
}

function resetTranslate() {
  changed = []
  tr.busy = false
  tr.done = false
  tr.plain = null
  tr.target = readTarget()
  const lang = detectLang(bodyText())
  tr.source = lang || 'en'
  tr.show = !!currentEmail.value.emailId && !!lang && lang !== tr.target
}

function onLangChange() {
  try { localStorage.setItem('mail-translate-target', tr.target) } catch (e) {}
  restoreOriginal()
}

function restoreOriginal() {
  changed.forEach(item => { if (item.node.isConnected) item.node.nodeValue = item.value })
  changed = []
  tr.plain = null
  tr.done = false
}

function collectNodes(root) {
  const nodes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (parent && /^(STYLE|SCRIPT|NOSCRIPT)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT
      const v = node.nodeValue.trim()
      if (v.length < 2 || /^[\d\s\p{P}\p{S}]+$/u.test(v) || /^https?:\/\//.test(v)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  while (walker.nextNode()) nodes.push(walker.currentNode)
  return nodes
}

function batches(list, maxCount = 80, maxChars = 11000) {
  const out = []
  let cur = [], size = 0
  for (const item of list) {
    const len = item.text.length
    if (cur.length && (cur.length >= maxCount || size + len > maxChars)) { out.push(cur); cur = []; size = 0 }
    cur.push(item)
    size += len
  }
  if (cur.length) out.push(cur)
  return out
}

async function translate() {
  if (tr.busy) return
  tr.busy = true
  restoreOriginal()
  try {
    const root = shadowRef.value?.getRoot?.()
    if (currentEmail.value.content && root) {
      const items = collectNodes(root).map(node => ({node, text: node.nodeValue.slice(0, 2000)}))
      const groups = batches(items)
      for (let i = 0; i < groups.length; i++) {
        tr.progress = `翻译中 ${i + 1}/${groups.length}…`
        const data = await emailTranslate(groups[i].map(x => x.text), tr.source, tr.target)
        groups[i].forEach((item, k) => {
          const value = data.segments?.[k]
          if (value && item.node.isConnected) {
            changed.push({node: item.node, value: item.node.nodeValue})
            item.node.nodeValue = value
          }
        })
      }
    } else {
      const paragraphs = String(currentEmail.value.text || '').split(/\n{2,}/)
      const items = paragraphs.map(text => ({text: text.slice(0, 3000)}))
      const out = []
      const groups = batches(items)
      for (let i = 0; i < groups.length; i++) {
        tr.progress = `翻译中 ${i + 1}/${groups.length}…`
        const data = await emailTranslate(groups[i].map(x => x.text), tr.source, tr.target)
        out.push(...(data.segments || []))
      }
      tr.plain = out.join('\n\n')
    }
    tr.done = true
  } catch (e) {
    // 出错信息已由请求层提示
  } finally {
    tr.busy = false
  }
}

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

function handleMove(folder) {
  const email = currentEmail.value
  emailMoveFolder(email.emailId, folder).then(() => {
    ElMessage({message: `已移到${['收件箱', '垃圾邮件', '其他通知'][folder]}`, type: 'success', plain: true})
    email.isSpam = folder
    emailStore.deleteIds = [email.emailId]
    emailStore.emailScroll?.refreshList?.()
    emailStore.spamScroll?.refreshList?.()
    emailStore.otherScroll?.refreshList?.()
    emit('deleted', email)
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
  min-height: 58px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--lq-border);
  color: var(--lq-text);

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
  padding: 0 0 38px;
}

.email-title {
  font-size: 19px;
  line-height: 1.5;
  font-weight: 600;
  padding: 18px 24px 0;
  margin-bottom: 12px;
  color: var(--lq-text);
}

.email-meta {
  display: flex;
  align-items: flex-start;
  border-bottom: 1px solid var(--lq-border);
  padding: 0 24px 16px;
  margin-bottom: 0;
  color: var(--lq-muted);
  font-size: 13px;
  line-height: 22px;
}

.lq-header-avatar {
  margin-right: 12px;
}

.lq-envelope {
  flex: 1;
  min-width: 0;
}

.lq-sender-line {
  align-items: baseline;
  .sender-name { color: var(--lq-text); font-weight: 500; }
  .lq-addr { color: var(--lq-muted); }
  .meta-date { margin: 0 0 0 auto; padding-left: 14px; white-space: nowrap; }
}

.meta-row {
  display: flex;
  gap: 9px;
  margin-bottom: 2px;
  line-height: 22px;
}

.meta-label {
  flex: 0 0 auto;
  font-weight: 400;
  font-size: 12px;
  color: var(--lq-muted);
}

.meta-value {
  min-width: 0;
  word-break: break-word;
}

.sender-name {
  margin-right: 6px;
}

.meta-date {
  color: var(--lq-muted);
  font-size: 12px;
}

.email-msg {
  margin-top: 10px;
  max-width: 560px;
}

.lq-translate {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 24px 0;
  padding: 8px 12px;
  border: 1px solid var(--lq-border);
  border-radius: 8px;
  background: var(--lq-side);
  font-size: 13px;
  color: var(--lq-muted);
}
.lq-translate-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--lq-primary);
  color: var(--lq-on-primary);
  font-size: 12px;
  flex: none;
}
.lq-translate-info {
  flex: 1;
  min-width: 0;
}
.lq-translate-more {
  cursor: pointer;
  padding: 0 6px;
  font-size: 18px;
  line-height: 1;
  color: var(--lq-text);
}
.lq-translate-menu {
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  width: 200px;
  label { font-size: 12px; color: var(--lq-muted); }
}

.message-stage {
  min-height: 620px;
  padding: 28px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: var(--lq-bg);
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
  margin: 24px;
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
