<template>
  <div class="ac-page">
    <div class="ac-toolbar">
      <div class="ac-row">
        <el-input v-model.trim="params.email" clearable class="ac-search" placeholder="搜索邮箱" @keyup.enter="search" @clear="search">
          <template #prefix><Icon icon="iconoir:search" width="15" height="15"/></template>
        </el-input>
        <el-input v-model.trim="params.tiktokUsername" clearable class="ac-search" placeholder="搜索 TikTok" @keyup.enter="search" @clear="search"/>
        <el-input v-model.trim="params.keyword" clearable class="ac-search ac-hide-sm" placeholder="搜索备注" @keyup.enter="search" @clear="search"/>
        <el-input v-model.trim="params.followersFilter" clearable class="ac-search-sm" placeholder="粉丝 >10000" @keyup.enter="search" @clear="search"/>
        <el-select v-model="params.domain" class="ac-select" placeholder="全部域名" @change="search">
          <el-option label="全部域名" value=""/>
          <el-option v-for="item in domainOptions" :key="item" :label="`@${item}`" :value="item"/>
        </el-select>
        <el-select v-model="params.creatorStatus" class="ac-select-sm" placeholder="中视频" @change="search">
          <el-option label="全部中视频" value=""/>
          <el-option v-for="item in creatorStatusOptions" :key="item.value" :label="item.label" :value="item.value"/>
        </el-select>
        <el-select v-model="params.status" class="ac-select-sm" @change="search">
          <el-option label="正常" value="active"/>
          <el-option label="已删除" value="deleted"/>
          <el-option label="全部" value="all"/>
        </el-select>
        <el-tooltip content="清空筛选并刷新"><el-button circle @click="refresh"><Icon icon="ion:reload" width="15" height="15"/></el-button></el-tooltip>
      </div>
      <div class="ac-row">
        <el-dropdown trigger="click" @command="runScan">
          <el-button :loading="scanLoading || scanTikTokLoading">
            <Icon icon="mdi:email-search-outline" width="16" height="16"/>
            <span>从邮件识别</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="tiktok">识别 TikTok 用户名</el-dropdown-item>
              <el-dropdown-item command="creator">识别中视频状态</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" :loading="exportLoading" @click="exportTxt">
          <Icon icon="ph:export" width="16" height="16"/>
          <span>导出{{ selectedRows.length ? `选中 (${selectedRows.length})` : '' }}</span>
        </el-button>
        <el-button v-if="selectedDeletedRows.length > 0" type="primary" plain :loading="batchLoading" @click="restoreSelectedAssets">
          恢复 ({{ selectedDeletedRows.length }})
        </el-button>
        <el-button type="danger" plain :disabled="selectedDeletableRows.length === 0" :loading="batchLoading" @click="deleteSelectedAssets">
          删除{{ selectedDeletableRows.length ? ` (${selectedDeletableRows.length})` : '' }}
        </el-button>
      </div>
    </div>

    <el-scrollbar ref="scrollbarRef" class="ac-scroll">
      <div class="ac-table">
        <el-table
            ref="tableRef"
            v-loading="loading"
            :data="rows"
            row-key="accountId"
            :empty-text="loading ? '' : '暂无邮箱资产'"
            style="width: 100%;"
            @selection-change="selectionChange"
        >
          <el-table-column width="42" type="selection" fixed="left"/>
          <el-table-column label="邮箱" min-width="230" fixed="left">
            <template #default="{row}">
              <div class="ac-email">
                <span class="ac-email-text" :title="row.email">{{ row.email }}</span>
                <el-tag v-if="Number(row.isDel || 0) === 1" type="info" size="small">已删除</el-tag>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="备注" min-width="150">
            <template #default="{row}">
              <el-input
                  v-model="row.editName"
                  class="ac-inline"
                  size="small"
                  maxlength="80"
                  placeholder="点击填写"
                  @blur="saveTextField(row, 'name', 'editName')"
                  @keyup.enter="$event.target.blur()"
              />
            </template>
          </el-table-column>

          <el-table-column label="TikTok" min-width="200">
            <template #default="{row}">
              <div class="ac-tiktok">
                <el-input
                    v-model="row.editTiktokUsername"
                    class="ac-inline"
                    size="small"
                    maxlength="80"
                    placeholder="用户名或主页链接"
                    @blur="saveTextField(row, 'tiktokUsername', 'editTiktokUsername')"
                    @keyup.enter="$event.target.blur()"
                />
                <Icon v-if="row.tiktokUrl" class="ac-open" icon="ri:external-link-line" width="16" height="16" title="打开主页" @click="openTikTok(row)"/>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="粉丝" width="110" align="right">
            <template #default="{row}">
              <el-input-number
                  v-model="row.editTiktokFollowers"
                  :min="0"
                  :controls="false"
                  size="small"
                  class="ac-num"
                  @change="saveMetricField(row, 'tiktokFollowers', 'editTiktokFollowers')"
              />
            </template>
          </el-table-column>

          <el-table-column label="播放" width="120" align="right">
            <template #default="{row}">
              <el-input-number
                  v-model="row.editTiktokViews"
                  :min="0"
                  :controls="false"
                  size="small"
                  class="ac-num"
                  @change="saveMetricField(row, 'tiktokViews', 'editTiktokViews')"
              />
            </template>
          </el-table-column>

          <el-table-column label="中视频" width="120">
            <template #default="{row}">
              <el-select
                  v-model="row.editCreatorStatus"
                  size="small"
                  clearable
                  placeholder="—"
                  :class="['ac-status', creatorClass(row.editCreatorStatus)]"
                  @change="saveCreatorStatus(row)"
              >
                <el-option v-for="item in creatorStatusOptions" :key="item.value" :label="item.label" :value="item.value"/>
              </el-select>
            </template>
          </el-table-column>

          <el-table-column min-width="160">
            <template #header>
              <div class="ac-pwd-head">
                <span>密码</span>
                <Icon
                    class="ac-open"
                    :icon="showAllPasswords ? 'mdi:eye-off-outline' : 'mdi:eye-outline'"
                    width="16"
                    height="16"
                    :title="showAllPasswords ? '隐藏密码' : '显示密码'"
                    @click.stop="toggleAllPasswords"
                />
              </div>
            </template>
            <template #default="{row}">
              <el-input
                  v-model="row.editPassword"
                  class="ac-inline"
                  size="small"
                  maxlength="256"
                  :type="showAllPasswords ? 'text' : 'password'"
                  placeholder="—"
                  @blur="saveTextField(row, 'password', 'editPassword')"
                  @keyup.enter="$event.target.blur()"
              />
            </template>
          </el-table-column>
        </el-table>

        <div class="ac-pagination" v-if="total > 0">
          <el-pagination
              :current-page="params.num"
              :page-size="params.size"
              :page-sizes="[20, 50, 100]"
              background
              layout="total, prev, pager, next, sizes"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
        </div>
      </div>
    </el-scrollbar>

    <el-dialog v-model="exportDialogShow" class="export-dialog" title="导出邮箱资产 TXT">
      <div class="export-result">
        <p>{{ exportScope }}，共 {{ exportCount }} 条。</p>
        <el-input
            :model-value="exportText"
            type="textarea"
            readonly
            resize="vertical"
            :rows="16"
        />
      </div>
      <template #footer>
        <el-button @click="copyExportText">
          <Icon icon="ph:copy" width="18" height="18"/>
          复制
        </el-button>
        <el-button type="primary" @click="downloadExportTxt">
          <Icon icon="ph:download-simple" width="18" height="18"/>
          下载 TXT
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {Icon} from '@iconify/vue'
import {useSettingStore} from '@/store/setting.js'
import {assetBatchStatus, assetExportTxt, assetList, assetScanCreatorRewards, assetScanTikTokInbox, assetUpdate} from '@/request/asset.js'
import {tzDayjs} from '@/utils/day.js'

defineOptions({
  name: 'asset-center'
})

const settingStore = useSettingStore()
const route = useRoute()
const router = useRouter()
const domainOptions = computed(() => (settingStore.domainList || []).map(cleanDomain).filter(Boolean))
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const scanLoading = ref(false)
const scanTikTokLoading = ref(false)
const batchLoading = ref(false)
const exportLoading = ref(false)
const syncDialogShow = ref(false)
const exportDialogShow = ref(false)
const exportText = ref('')
const exportCount = ref(0)
const exportScope = ref('')
const showAllPasswords = ref(false)
const scrollbarRef = ref(null)
const tableRef = ref(null)
const selectedRows = ref([])
const selectedDeletableRows = computed(() => selectedRows.value.filter(row => Number(row.isDel || 0) !== 1))
const selectedDeletedRows = computed(() => selectedRows.value.filter(row => Number(row.isDel || 0) === 1))
const syncOrigin = computed(() => window.location.origin)
const accountSyncUrl = computed(() => `${syncOrigin.value}/api/local-agent/account/sync`)
const statsSyncUrl = computed(() => `${syncOrigin.value}/api/local-agent/tiktok/stats`)
const syncExample = computed(() => JSON.stringify({
  createIfMissing: true,
  accounts: [
    {
      email: 'demo@orz.gay',
      remark: 'demo 备注',
      windowName: 'demo_window',
      tiktokUsername: 'demo_user',
      bitGroupName: 'demo_group',
      matrixAccountId: 'matrix_001',
      password: 'demo_password',
      followers: 12000,
      views: 180000,
      loginStatus: 'normal'
    }
  ]
}, null, 2))

const params = reactive(defaultParams())

const queryKeys = [
  'email',
  'tiktokUsername',
  'keyword',
  'bitGroupName',
  'deviceNo',
  'deviceState',
  'followersFilter',
  'domain',
  'emailScope',
  'status',
  'tiktokLinked',
  'bitBrowserLinked',
  'syncState',
  'loginHealth',
  'creatorReady',
  'creatorTodo',
  'creatorStatus',
  'loginStatus',
  'num',
  'size'
]

const creatorStatusOptions = [
  {label: '已加入', value: '已加入'},
  {label: '被拒绝', value: '被拒绝'},
  {label: '已封', value: '已封'},
  {label: '无权限', value: '无权限'}
]

let syncingQuery = false

onMounted(() => {
  applyRouteQuery()
  getList(true)
})

watch(
    () => route.query,
    () => {
      if (route.name !== 'asset-center' || syncingQuery) return
      applyRouteQuery()
      getList(true)
    }
)

function search() {
  params.num = 1
  updateRouteQuery()
}

function refresh() {
  Object.assign(params, defaultParams())
  updateRouteQuery()
}

function numChange(num) {
  params.num = num
  updateRouteQuery()
}

function sizeChange(size) {
  params.size = size
  params.num = 1
  updateRouteQuery()
}

function defaultParams() {
  return {
    email: '',
    tiktokUsername: '',
    keyword: '',
    bitGroupName: '',
    deviceNo: '',
    deviceState: '',
    followersFilter: '',
    domain: '',
    emailScope: '',
    status: 'active',
    tiktokLinked: '',
    bitBrowserLinked: '',
    syncState: '',
    loginHealth: '',
    creatorReady: '',
    creatorTodo: '',
    creatorStatus: '',
    loginStatus: '',
    num: 1,
    size: 20
  }
}

function applyRouteQuery() {
  const nextParams = defaultParams()
  queryKeys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(route.query, key)) return
    nextParams[key] = normalizeQueryValue(key, route.query[key])
  })
  Object.assign(params, nextParams)
}

function updateRouteQuery() {
  const query = buildRouteQuery()
  if (sameQuery(route.query, query)) {
    getList(true)
    return
  }

  syncingQuery = true
  router.replace({name: 'asset-center', query}).catch(() => {}).finally(() => {
    syncingQuery = false
    getList(true)
  })
}

function buildRouteQuery() {
  const defaults = defaultParams()
  const query = {}
  queryKeys.forEach(key => {
    const value = params[key]
    if (key === 'num') {
      if (Number(value) > defaults.num) query[key] = String(value)
      return
    }
    if (key === 'size') {
      if (Number(value) !== defaults.size) query[key] = String(value)
      return
    }
    if (String(value || '') && value !== defaults[key]) {
      query[key] = String(value)
    }
  })
  return query
}

function normalizeQueryValue(key, value) {
  const text = Array.isArray(value) ? String(value[0] || '') : String(value || '')
  if (key === 'num') return Math.max(1, Number.parseInt(text, 10) || 1)
  if (key === 'size') return Math.min(100, Math.max(1, Number.parseInt(text, 10) || 20))
  if (key === 'domain') return cleanDomain(text)
  return text.trim()
}

function sameQuery(current, next) {
  const currentKeys = Object.keys(current || {}).filter(key => String(routeValue(current[key]) || '') !== '').sort()
  const nextKeys = Object.keys(next || {}).sort()
  if (currentKeys.length !== nextKeys.length) return false
  return currentKeys.every((key, index) => key === nextKeys[index] && String(routeValue(current[key])) === String(next[key]))
}

function routeValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function getList(showLoading = false) {
  if (showLoading) loading.value = true
  assetList({...params}).then(data => {
    rows.value = (data.list || []).map(normalizeRow)
    total.value = data.total || 0
    selectedRows.value = []
    scrollbarRef.value?.setScrollTop(0)
  }).finally(() => {
    loading.value = false
  })
}

function normalizeRow(row) {
  return {
    ...row,
    editName: row.name || '',
    editTiktokUsername: row.tiktokUsername || '',
    editPassword: row.password || '',
    editDeviceNo: row.deviceNo || '',
    editCreatorStatus: row.creatorStatus || '',
    editCreatorRetryAt: row.creatorRewardsRetryAt ? String(row.creatorRewardsRetryAt).slice(0, 10) : '',
    editTiktokFollowers: Number(row.tiktokFollowers || 0),
    editTiktokViews: Number(row.tiktokViews || 0),
    saving: false
  }
}

function saveTextField(row, field, editField) {
  const value = String(row[editField] || '').trim()
  if (value === String(row[field] || '')) return
  saveRow(row, {[field]: value})
}

function saveMetricField(row, field, editField) {
  const value = Number(row[editField] || 0)
  if (value === Number(row[field] || 0)) return
  saveRow(row, {[field]: value})
}

function saveCreatorStatus(row) {
  const value = validCreatorStatus(row.editCreatorStatus) ? row.editCreatorStatus : ''
  if (value === String(row.creatorStatus || '')) return
  saveRow(row, {creatorStatus: value})
}

function saveCreatorRetryAt(row) {
  const value = String(row.editCreatorRetryAt || '').trim()
  const current = row.creatorRewardsRetryAt ? String(row.creatorRewardsRetryAt).slice(0, 10) : ''
  if (value === current) return
  saveRow(row, {creatorRetryAt: value})
}

function selectionChange(selection) {
  selectedRows.value = selection || []
}

function deleteSelectedAssets() {
  const list = selectedDeletableRows.value
  if (list.length === 0) {
    ElMessage({message: '没有可删除的邮箱资产', type: 'warning', plain: true})
    return
  }
  ElMessageBox.confirm(
      `确认软删除 ${list.length} 个邮箱资产？删除后只会从正常资产列表隐藏，不会删除原始邮件、本地软件数据和数据库记录。`,
      '软删除邮箱资产',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
  ).then(() => batchSetAssetStatus(list, 'delete'))
}

function restoreSelectedAssets() {
  const list = selectedDeletedRows.value
  if (list.length === 0) {
    ElMessage({message: '没有可恢复的邮箱资产', type: 'warning', plain: true})
    return
  }
  ElMessageBox.confirm(
      `确认恢复 ${list.length} 个邮箱资产？恢复后会重新出现在正常资产列表。`,
      '恢复邮箱资产',
      {
        confirmButtonText: '确认恢复',
        cancelButtonText: '取消',
        type: 'warning'
      }
  ).then(() => batchSetAssetStatus(list, 'restore'))
}

function batchSetAssetStatus(list, action) {
  if (batchLoading.value) return
  batchLoading.value = true
  assetBatchStatus(list.map(row => row.accountId), action).then(data => {
    const label = action === 'restore' ? '恢复' : '软删除'
    ElMessage({
      message: `${label}成功 ${data.updated || 0} 个`,
      type: 'success',
      plain: true
    })
    tableRef.value?.clearSelection?.()
    getList(true)
  }).finally(() => {
    batchLoading.value = false
  })
}

function saveRow(row, payload) {
  if (row.saving) return
  row.saving = true
  assetUpdate(row.accountId, payload).then(data => {
    Object.assign(row, normalizeRow(data))
    ElMessage({message: '资产信息已保存', type: 'success', plain: true})
  }).catch(() => {
    Object.assign(row, normalizeRow(row))
  }).finally(() => {
    row.saving = false
  })
}

function scanCreatorRewards() {
  if (scanLoading.value) return
  scanLoading.value = true
  assetScanCreatorRewards({
    domain: params.domain || '',
    limit: 3000
  }).then(data => {
    ElMessage({
      message: `扫描完成：扫描 ${data.scanned || 0} 封，更新 ${data.updated || 0} 个，已加入 ${data.joined || 0}，被拒 ${data.rejected || 0}，已封 ${data.banned || 0}`,
      type: 'success',
      plain: true
    })
    getList(true)
  }).finally(() => {
    scanLoading.value = false
  })
}

function scanTikTokInbox() {
  if (scanTikTokLoading.value) return
  scanTikTokLoading.value = true
  assetScanTikTokInbox({
    domain: params.domain || '',
    limit: 10000
  }).then(data => {
    ElMessage({
      message: `扫描完成：扫描 ${data.scanned || 0} 封，创建 ${data.created || 0} 个，更新 ${data.updated || 0} 个，冲突 ${data.conflict || 0} 个`,
      type: 'success',
      plain: true
    })
    getList(true)
  }).finally(() => {
    scanTikTokLoading.value = false
  })
}

function openTikTok(row) {
  if (!row.tiktokUrl) return
  window.open(row.tiktokUrl, '_blank', 'noopener,noreferrer')
}

function toggleAllPasswords() {
  showAllPasswords.value = !showAllPasswords.value
}

async function copySyncText(text) {
  await writeClipboardText(text)
  ElMessage({message: '\u590d\u5236\u6210\u529f', type: 'success', plain: true})
}

async function exportTxt() {
  if (exportLoading.value) return
  exportLoading.value = true
  try {
    const pageSize = 20
    const accountIds = selectedRows.value
        .map(row => Number(row.accountId))
        .filter(accountId => Number.isInteger(accountId) && accountId > 0)
    const exportParams = accountIds.length > 0 ? {...params, accountIds} : {...params}
    const first = await assetExportTxt({...exportParams, num: 1, size: pageSize})
    const pageTotal = Number(first?.pageTotal || 0)
    const firstText = String(first?.text || '')

    if (!firstText) {
      ElMessage({message: '没有可导出的资产', type: 'warning', plain: true})
      return
    }

    const parts = [firstText]
    for (let num = 2; num <= pageTotal; num++) {
      const data = await assetExportTxt({...exportParams, num, size: pageSize})
      const pageText = String(data?.text || '')
      if (pageText) {
        parts.push(pageText)
      }
    }

    const text = parts.filter(Boolean).join('\n')
    exportText.value = text
    exportCount.value = text.split('\n').filter(Boolean).length
    exportScope.value = accountIds.length > 0 ? '已勾选的邮箱' : '当前筛选结果'
    exportDialogShow.value = true
  } catch (error) {
    ElMessage({
      message: `导出失败：${error?.message || '请稍后重试'}`,
      type: 'error',
      plain: true
    })
  } finally {
    exportLoading.value = false
  }
}

async function copyExportText() {
  if (!exportText.value) return
  try {
    await writeClipboardText(exportText.value)
    ElMessage({message: `已复制 ${exportCount.value} 条`, type: 'success', plain: true})
  } catch (error) {
    ElMessage({message: `复制失败：${error?.message || '请使用下载 TXT'}`, type: 'error', plain: true})
  }
}

function downloadExportTxt() {
  if (!exportText.value) return
  const blob = new Blob(['\ufeff', exportText.value], {type: 'text/plain;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `mail-assets-${tzDayjs().format('YYYY-MM-DD')}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (error) {
      // 继续走兜底方案。
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!ok) {
    throw new Error('浏览器不支持复制')
  }
}

function loginTagType(value) {
  if (value === 'normal') return 'success'
  if (value === 'abnormal') return 'danger'
  return 'info'
}

function loginText(value) {
  if (value === 'normal') return '正常'
  if (value === 'abnormal') return '异常'
  return '未同步'
}

function runScan(command) {
  if (command === 'creator') scanCreatorRewards()
  else scanTikTokInbox()
}

function creatorClass(value) {
  return {'已加入': 'is-ok', '被拒绝': 'is-bad', '已封': 'is-bad', '无权限': 'is-warn'}[value] || ''
}

function validCreatorStatus(value) {
  return creatorStatusOptions.some(item => item.value === value)
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function formatTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}

function cleanDomain(domain) {
  return String(domain || '').replace(/^@/, '').trim().toLowerCase()
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
</script>

<style scoped lang="scss">
.ac-page {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ac-toolbar {
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

.ac-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.ac-search {
  width: 170px;
}

.ac-search-sm {
  width: 120px;
}

.ac-select {
  width: 140px;
}

.ac-select-sm {
  width: 110px;
}

.ac-hide-sm {
  @media (max-width: 1100px) {
    display: none;
  }
}

.ac-scroll {
  flex: 1;
  min-height: 0;
}

.ac-table {
  min-height: 100%;
}

.ac-email {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ac-email-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.ac-tiktok, .ac-pwd-head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ac-open {
  flex-shrink: 0;
  cursor: pointer;
  color: var(--el-text-color-secondary);

  &:hover {
    color: var(--el-color-primary);
  }
}

.ac-inline {
  :deep(.el-input__wrapper) {
    box-shadow: none;
    background: transparent;
    padding-left: 0;
  }

  :deep(.el-input__wrapper:hover),
  :deep(.el-input__wrapper.is-focus) {
    box-shadow: 0 0 0 1px var(--el-border-color) inset;
    background: var(--el-fill-color-blank);
    padding-left: 8px;
  }
}

.ac-num {
  width: 100%;

  :deep(.el-input__wrapper) {
    box-shadow: none;
    background: transparent;
  }

  :deep(.el-input__wrapper:hover),
  :deep(.el-input__wrapper.is-focus) {
    box-shadow: 0 0 0 1px var(--el-border-color) inset;
  }

  :deep(.el-input__inner) {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
}

.ac-status {
  :deep(.el-select__wrapper) {
    box-shadow: none;
    background: transparent;
  }

  &.is-ok :deep(.el-select__selected-item) { color: var(--el-color-success); }
  &.is-bad :deep(.el-select__selected-item) { color: var(--el-color-danger); }
  &.is-warn :deep(.el-select__selected-item) { color: var(--el-color-warning); }
}

.ac-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 14px 16px 20px;
}

.export-result p {
  margin: 0 0 10px;
  color: var(--el-text-color-secondary);
}
</style>
