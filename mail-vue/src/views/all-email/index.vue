<template>
  <div class="ae-page">
    <div class="ae-toolbar">
      <div class="ae-row">
        <el-input v-model="searchValue" clearable class="ae-search" :placeholder="searchPlaceholder" @keyup.enter="search" @clear="search">
          <template #prepend>
            <el-select v-model="params.searchType" class="ae-type">
              <el-option label="收件邮箱" value="account"/>
              <el-option label="发件人" value="name"/>
              <el-option label="标题" value="subject"/>
            </el-select>
          </template>
        </el-input>
        <el-select v-model="params.type" class="ae-select" @change="search">
          <el-option label="收到的" value="receive"/>
          <el-option label="发出的" value="send"/>
          <el-option label="全部" value="all"/>
          <el-option label="已删除" value="delete"/>
          <el-option label="无人收件" value="noone"/>
        </el-select>
        <el-button @click="search">搜索</el-button>
        <el-tooltip :content="params.timeSort ? '当前：最早的在前' : '当前：最新的在前'">
          <el-button circle @click="changeTimeSort">
            <Icon :icon="params.timeSort ? 'material-symbols-light:timer-arrow-up-outline' : 'material-symbols-light:timer-arrow-down-outline'" width="20" height="20"/>
          </el-button>
        </el-tooltip>
        <el-tooltip content="清空筛选并刷新"><el-button circle @click="refresh"><Icon icon="ion:reload" width="15" height="15"/></el-button></el-tooltip>
      </div>
      <div class="ae-row">
        <span class="ae-count" v-if="total">共 {{ total.toLocaleString() }} 封</span>
        <el-button type="danger" plain :disabled="selected.length === 0" @click="deleteSelected">
          删除{{ selected.length ? ` (${selected.length})` : '' }}
        </el-button>
        <el-button @click="showBathDelete = true">
          <Icon icon="fluent:broom-sparkle-16-regular" width="16" height="16"/>
          <span>按条件清理</span>
        </el-button>
      </div>
    </div>

    <el-scrollbar ref="scrollbarRef" class="ae-scroll">
      <el-table
          v-loading="loading && list.length === 0"
          :data="list"
          row-key="emailId"
          :empty-text="loading ? '' : '没有邮件'"
          style="width: 100%;"
          @row-click="openEmail"
          @selection-change="rows => selected = rows"
      >
        <el-table-column type="selection" width="42"/>
        <el-table-column label="时间" width="128">
          <template #default="{row}">
            <span class="ae-time" :title="fullTime(row.createTime)">{{ shortTime(row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发件人" min-width="190">
          <template #default="{row}">
            <div class="ae-from">
              <span class="ae-from-name">{{ row.name || row.sendEmail }}</span>
              <span class="ae-from-mail">{{ row.sendEmail }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="收件邮箱" min-width="190">
          <template #default="{row}">
            <span class="ae-to" :title="row.toEmail">{{ row.toEmail || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="280">
          <template #default="{row}">
            <div class="ae-subject">
              <el-tag v-if="row.type === 1" size="small" type="info">发出</el-tag>
              <el-tag v-if="row.isSpam === 1" size="small" type="warning">垃圾</el-tag>
              <span class="ae-subject-text" :title="row.subject">{{ row.subject || '(无标题)' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="验证码" width="120">
          <template #default="{row}">
            <span v-if="codeOf(row)" class="ae-code" title="点击复制" @click.stop="copyCode(codeOf(row))">{{ codeOf(row) }}</span>
            <span v-else class="ae-muted">—</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="ae-more">
        <el-button v-if="hasMore" :loading="loading" @click="loadMore">加载更多</el-button>
        <span v-else-if="list.length" class="ae-muted">已经到底了</span>
      </div>
    </el-scrollbar>

    <el-dialog v-model="showBathDelete" title="按条件清理邮件" width="360" @closed="closedClear">
      <div class="clear-email">
        <el-input v-model="clearParams.sendName" placeholder="发件人名称"/>
        <el-input v-model="clearParams.subject" placeholder="标题"/>
        <el-input v-model="clearParams.sendEmail" placeholder="发件人邮箱"/>
        <el-input v-model="clearParams.toEmail" placeholder="收件邮箱"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        range-separator="至"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option label="完全相同" value="eq"/>
            <el-option label="开头匹配" value="left"/>
            <el-option label="包含" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">清理</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineOptions, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {Icon} from '@iconify/vue'
import router from '@/router/index.js'
import {useEmailStore} from '@/store/email.js'
import {useSettingStore} from '@/store/setting.js'
import {allEmailBatchDelete, allEmailDelete, allEmailLatest, allEmailList} from '@/request/all-email.js'
import {toUtc, tzDayjs} from '@/utils/day.js'
import {sleep} from '@/utils/time-utils.js'

defineOptions({
  name: 'all-email'
})

const PAGE_SIZE = 50
const route = useRoute()
const emailStore = useEmailStore()
const settingStore = useSettingStore()

const list = ref([])
const total = ref(0)
const loading = ref(false)
const hasMore = ref(false)
const selected = ref([])
const searchValue = ref('')
const scrollbarRef = ref(null)
const showBathDelete = ref(false)
const clearLoading = ref(false)
const clearTime = ref('')
let alive = true

const params = reactive({
  timeSort: 0,
  type: 'receive',
  searchType: 'account'
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq'
})

const searchPlaceholder = computed(() => ({
  account: '搜索收件邮箱，例如 d351@ntmcn.com',
  name: '搜索发件人',
  subject: '搜索标题'
}[params.searchType] || '搜索'))

try {
  const saved = JSON.parse(localStorage.getItem('all-email-params-v2') || 'null')
  if (saved) {
    params.type = saved.type || params.type
    params.timeSort = Number(saved.timeSort || 0)
    params.searchType = saved.searchType || params.searchType
  }
} catch (e) {}

watch(() => ({...params}), (value) => {
  try { localStorage.setItem('all-email-params-v2', JSON.stringify(value)) } catch (e) {}
})

onMounted(() => {
  load(true)
  pollLatest()
})

onBeforeUnmount(() => {
  alive = false
})

function buildQuery(emailId) {
  const query = {emailId, size: PAGE_SIZE, timeSort: params.timeSort, type: params.type}
  const value = String(searchValue.value || '').trim()
  if (value) {
    if (params.searchType === 'account') query.accountEmail = value
    if (params.searchType === 'name') query.name = value
    if (params.searchType === 'subject') query.subject = value
  }
  return query
}

async function load(reset = false) {
  if (loading.value) return
  loading.value = true
  try {
    const cursor = reset || list.value.length === 0 ? 0 : list.value[list.value.length - 1].emailId
    const data = await allEmailList(buildQuery(cursor))
    const rows = (data.list || []).map(withCode)
    list.value = reset ? rows : [...list.value, ...rows]
    total.value = data.total || 0
    hasMore.value = rows.length === PAGE_SIZE
    if (reset) scrollbarRef.value?.setScrollTop(0)
  } catch (e) {
    // 全局已提示
  } finally {
    loading.value = false
  }
}

function loadMore() {
  load(false)
}

function search() {
  load(true)
}

function refresh() {
  searchValue.value = ''
  params.type = 'receive'
  params.timeSort = 0
  load(true)
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  load(true)
}

function openEmail(row) {
  emailStore.contentData.email = row
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content'})
}

function deleteSelected() {
  if (selected.value.length === 0) return
  ElMessageBox.confirm(`确认彻底删除选中的 ${selected.value.length} 封邮件？删除后无法恢复。`, {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const ids = selected.value.map(row => row.emailId)
    await allEmailDelete(ids.join(','))
    const idSet = new Set(ids)
    list.value = list.value.filter(row => !idSet.has(row.emailId))
    total.value = Math.max(0, total.value - ids.length)
    selected.value = []
    ElMessage({message: '已删除', type: 'success', plain: true})
  }).catch(() => {})
}

function batchDelete() {
  if (clearTime.value) {
    clearParams.startTime = toUtc(clearTime.value[0]).format('YYYY-MM-DD HH:mm:ss')
    clearParams.endTime = toUtc(clearTime.value[1]).add(1, 'day').format('YYYY-MM-DD HH:mm:ss')
  }
  if (!clearParams.sendEmail && !clearParams.sendName && !clearParams.subject && !clearParams.toEmail && !clearTime.value) {
    showBathDelete.value = false
    return
  }
  ElMessageBox.confirm('确认按这些条件彻底删除邮件？删除后无法恢复。', {
    confirmButtonText: '清理',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    clearLoading.value = true
    allEmailBatchDelete(clearParams).then(() => {
      ElMessage({message: '清理完成', type: 'success', plain: true})
      showBathDelete.value = false
      load(true)
    }).finally(() => {
      clearLoading.value = false
    })
  }).catch(() => {})
}

function closedClear() {
  Object.assign(clearParams, {subject: '', sendEmail: '', sendName: '', startTime: '', toEmail: '', endTime: '', type: 'eq'})
  clearTime.value = null
}

// 没有 AI 识别时，从标题/正文里提取验证码
function codeOf(row) {
  return row.code || row._code || ''
}

function withCode(row) {
  if (row.code) return row
  const subject = String(row.subject || '')
  let m = subject.match(/(?:^|\D)(\d{4,8})(?=\D|$)/)
  if (!m || !/code|验证码|驗證碼|認証|verification|otp/i.test(subject)) m = null
  if (!m) {
    const text = String(row.text || '').slice(0, 4000)
    m = text.match(/(?:code|验证码|驗證碼|verification code)[^0-9]{0,30}(\d{4,8})(?!\d)/i)
  }
  return {...row, _code: m ? m[1] : ''}
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(String(code))
    ElMessage({message: `已复制 ${code}`, type: 'success', plain: true})
  } catch (e) {
    ElMessage({message: '浏览器不允许自动复制', type: 'warning', plain: true})
  }
}

function shortTime(value) {
  if (!value) return '-'
  const d = tzDayjs(value)
  const now = tzDayjs()
  if (d.isSame(now, 'day')) return d.format('HH:mm:ss')
  if (d.isSame(now, 'year')) return d.format('MM-DD HH:mm')
  return d.format('YYYY-MM-DD')
}

function fullTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm:ss') : ''
}

// 有新邮件时自动插到顶部（仅「收到的」+ 最新在前 + 没有搜索时）
async function pollLatest() {
  while (alive) {
    const autoRefresh = Number(settingStore.settings.autoRefresh || 0)
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 5000)
    if (!alive || autoRefresh < 2 || route.name !== 'all-email') continue
    if (params.type !== 'receive' || params.timeSort !== 0 || String(searchValue.value || '').trim()) continue
    const latestId = list.value[0]?.emailId
    if (!latestId) continue
    try {
      const rows = await allEmailLatest(latestId)
      if (Array.isArray(rows) && rows.length) {
        const existing = new Set(list.value.map(row => row.emailId))
        const fresh = rows.filter(row => !existing.has(row.emailId)).map(withCode).sort((a, b) => b.emailId - a.emailId)
        list.value = [...fresh, ...list.value]
        total.value += fresh.length
      }
    } catch (e) {
      // 忽略轮询错误
    }
  }
}
</script>

<style scoped lang="scss">
.ae-page {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ae-toolbar {
  padding: 10px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);

  :deep(.el-button > span) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.ae-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.ae-search {
  width: min(420px, calc(100vw - 40px));
}

.ae-type {
  width: 112px;
}

.ae-select {
  width: 110px;
}

.ae-count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.ae-scroll {
  flex: 1;
  min-height: 0;

  :deep(.el-table__row) {
    cursor: pointer;
  }
}

.ae-time {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.ae-from {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}

.ae-from-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ae-from-mail, .ae-muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ae-to {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.ae-subject {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ae-subject-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ae-code {
  font-family: ui-monospace, Consolas, monospace;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: .05em;
  color: var(--el-color-primary);
  cursor: copy;
  padding: 2px 6px;
  border-radius: 4px;

  &:hover {
    background: var(--el-color-primary-light-9);
  }
}

.ae-more {
  display: flex;
  justify-content: center;
  padding: 16px 0 24px;
}

.clear-email {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .clear-button {
    display: flex;
    gap: 10px;
  }
}
</style>
