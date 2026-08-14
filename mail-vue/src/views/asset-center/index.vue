<template>
  <div class="asset-page">
    <section class="toolbar">
      <div class="toolbar-title">
        <p>邮箱资产</p>
        <span>按邮箱维度管理窗口名、TikTok、密码、粉丝、播放和中视频状态</span>
      </div>
      <div class="toolbar-actions">
        <el-input v-model.trim="params.email" clearable class="search-input" placeholder="搜索邮箱" @keyup.enter="search" @clear="search" />
        <el-input v-model.trim="params.tiktokUsername" clearable class="search-input" placeholder="搜索 TikTok" @keyup.enter="search" @clear="search" />
        <el-input v-model.trim="params.keyword" clearable class="search-input" placeholder="搜索备注/窗口名" @keyup.enter="search" @clear="search" />
        <el-input v-model.trim="params.bitGroupName" clearable class="search-input" placeholder="搜索比特分组" @keyup.enter="search" @clear="search" />
        <el-input v-model.trim="params.deviceNo" clearable class="search-input small" placeholder="搜索设备号 ys28" @keyup.enter="search" @clear="search" />
        <el-input v-model.trim="params.followersFilter" clearable class="search-input small" placeholder="粉丝筛选 >10000" @keyup.enter="search" @clear="search" />
        <el-select v-model="params.domain" class="select" placeholder="全部域名" @change="search">
          <el-option label="全部域名" value="" />
          <el-option v-for="item in domainOptions" :key="item" :label="`@${item}`" :value="item" />
        </el-select>
        <el-select v-model="params.emailScope" class="select creator" placeholder="邮箱来源" @change="search">
          <el-option label="全部邮箱" value="" />
          <el-option label="项目域名" value="internal" />
          <el-option label="外部邮箱" value="external" />
        </el-select>
        <el-select v-model="params.status" class="select small" placeholder="状态" @change="search">
          <el-option label="正常资产" value="active" />
          <el-option label="全部" value="all" />
          <el-option label="已停用" value="disabled" />
          <el-option label="已删除" value="deleted" />
        </el-select>
        <el-select v-model="params.tiktokLinked" class="select small" placeholder="TikTok状态" @change="search">
          <el-option label="全部 TikTok" value="" />
          <el-option label="已识别" value="1" />
          <el-option label="未识别" value="0" />
        </el-select>
        <el-select v-model="params.bitBrowserLinked" class="select creator" placeholder="浏览器状态" @change="search">
          <el-option label="全部浏览器" value="" />
          <el-option label="已同步" value="1" />
          <el-option label="未同步" value="0" />
        </el-select>
        <el-select v-model="params.syncState" class="select creator" placeholder="本地同步" @change="search">
          <el-option label="全部同步" value="" />
          <el-option label="已同步" value="synced" />
          <el-option label="未同步" value="unsynced" />
        </el-select>
        <el-select v-model="params.loginHealth" class="select creator" placeholder="登录状态" @change="search">
          <el-option label="全部登录" value="" />
          <el-option label="正常" value="normal" />
          <el-option label="异常" value="abnormal" />
          <el-option label="未同步" value="unknown" />
        </el-select>
        <el-select v-model="params.creatorReady" class="select creator" placeholder="中视频参考" @change="search">
          <el-option label="全部" value="" />
          <el-option label="疑似达标" value="1" />
          <el-option label="待积累" value="0" />
        </el-select>
        <el-select v-model="params.creatorTodo" class="select creator" placeholder="中视频待办" @change="search">
          <el-option label="全部待办" value="" />
          <el-option label="待处理" value="1" />
        </el-select>
        <el-select v-model="params.creatorStatus" class="select creator" placeholder="中视频状态" @change="search">
          <el-option label="全部状态" value="" />
          <el-option v-for="item in creatorStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="params.deviceState" class="select creator" placeholder="设备状态" @change="search">
          <el-option label="全部设备" value="" />
          <el-option label="双开完整" value="complete" />
          <el-option label="只登录1个" value="single" />
          <el-option label="缺A位" value="missingA" />
          <el-option label="缺B位" value="missingB" />
          <el-option label="无设备号" value="empty" />
        </el-select>
        <el-button class="sync-button" type="success" plain :loading="scanLoading" @click="scanCreatorRewards">
          扫描中视频邮件
        </el-button>
        <el-button class="sync-button" type="warning" plain :loading="scanTikTokLoading" @click="scanTikTokInbox">
          扫描 TikTok 绑定
        </el-button>
        <el-button class="sync-button" type="primary" plain @click="syncDialogShow = true">
          &#x77e9;&#x9635;&#x540c;&#x6b65;&#x5165;&#x53e3;
        </el-button>
        <Icon class="tool-icon" icon="iconoir:search" width="20" height="20" @click="search" />
        <Icon class="tool-icon" icon="ion:reload" width="18" height="18" @click="refresh" />
        <el-button class="sync-button export-button" type="primary" :loading="exportLoading" @click="exportTxt">
          <Icon icon="ph:export" width="20" height="20" />
          一键导出 TXT
        </el-button>
        <el-button class="sync-button" type="danger" plain :disabled="selectedDeletableRows.length === 0" :loading="batchLoading" @click="deleteSelectedAssets">
          删除选中
        </el-button>
        <el-button
            v-if="params.status === 'deleted' || selectedDeletedRows.length > 0"
            class="sync-button"
            type="primary"
            plain
            :disabled="selectedDeletedRows.length === 0"
            :loading="batchLoading"
            @click="restoreSelectedAssets"
        >
          恢复选中
        </el-button>
      </div>
    </section>

    <el-scrollbar ref="scrollbarRef" class="table-scroll">
      <div class="table-wrap">
        <el-table
            ref="tableRef"
            v-loading="loading"
            :data="rows"
            row-key="accountId"
            :empty-text="loading ? '' : '暂无邮箱资产'"
            style="width: 100%;"
            @selection-change="selectionChange"
        >
          <el-table-column width="42" type="selection" fixed="left" />
          <el-table-column label="邮箱" min-width="230" fixed="left" show-overflow-tooltip>
            <template #default="props">
              <div class="mail-cell">
                <strong>{{ props.row.email }}</strong>
                <el-tag size="small">@{{ props.row.domain }}</el-tag>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="备注" min-width="170" show-overflow-tooltip>
            <template #default="props">
              <el-input
                  v-model="props.row.editName"
                  size="small"
                  maxlength="80"
                  placeholder="备注"
                  @blur="saveTextField(props.row, 'name', 'editName')"
                  @keyup.enter="$event.target.blur()"
              />
            </template>
          </el-table-column>

          <el-table-column label="TikTok" min-width="220">
            <template #default="props">
              <div class="inline-field">
                <el-input
                    v-model="props.row.editTiktokUsername"
                    size="small"
                    maxlength="80"
                    placeholder="用户名或主页链接"
                    @blur="saveTextField(props.row, 'tiktokUsername', 'editTiktokUsername')"
                    @keyup.enter="$event.target.blur()"
                />
                <Icon
                    v-if="props.row.tiktokUrl"
                    class="open-icon"
                    icon="ri:send-plane-line"
                    width="18"
                    height="18"
                    @click="openTikTok(props.row)"
                />
              </div>
            </template>
          </el-table-column>

          <el-table-column label="设备号" width="140" show-overflow-tooltip>
            <template #default="props">
              <el-input
                  v-model="props.row.editDeviceNo"
                  size="small"
                  maxlength="60"
                  placeholder=""
                  @blur="saveTextField(props.row, 'deviceNo', 'editDeviceNo')"
                  @keyup.enter="$event.target.blur()"
              />
            </template>
          </el-table-column>

          <el-table-column label="粉丝" width="130">
            <template #default="props">
              <el-input-number
                  v-model="props.row.editTiktokFollowers"
                  :min="0"
                  :controls="false"
                  size="small"
                  class="metric-input"
                  @change="saveMetricField(props.row, 'tiktokFollowers', 'editTiktokFollowers')"
              />
            </template>
          </el-table-column>

          <el-table-column label="播放" width="130">
            <template #default="props">
              <el-input-number
                  v-model="props.row.editTiktokViews"
                  :min="0"
                  :controls="false"
                  size="small"
                  class="metric-input"
                  @change="saveMetricField(props.row, 'tiktokViews', 'editTiktokViews')"
              />
            </template>
          </el-table-column>

          <el-table-column label="中视频状态" width="112">
            <template #default="props">
              <el-select
                  v-model="props.row.editCreatorStatus"
                  size="small"
                  clearable
                  placeholder=""
                  @change="saveCreatorStatus(props.row)"
              >
                <el-option v-for="item in creatorStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </template>
          </el-table-column>

          <el-table-column label="窗口名" min-width="170" show-overflow-tooltip>
            <template #default="props">
              <span>{{ props.row.windowName || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="比特分组" min-width="150" show-overflow-tooltip>
            <template #default="props">
              <span>{{ props.row.bitGroupName || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column min-width="170">
            <template #header>
              <div class="password-header">
                <span>密码</span>
                <Icon
                    class="open-icon"
                    :icon="showAllPasswords ? 'mdi:eye-off-outline' : 'mdi:eye-outline'"
                    width="18"
                    height="18"
                    :title="showAllPasswords ? '一键隐藏密码' : '一键显示密码'"
                    @click.stop="toggleAllPasswords"
                />
              </div>
            </template>
            <template #default="props">
              <div class="inline-field">
                <el-input
                    v-model="props.row.editPassword"
                    size="small"
                    maxlength="256"
                    :type="showAllPasswords ? 'text' : 'password'"
                    placeholder="密码"
                    @blur="saveTextField(props.row, 'password', 'editPassword')"
                    @keyup.enter="$event.target.blur()"
                />
              </div>
            </template>
          </el-table-column>

        </el-table>

        <div class="pagination" v-if="total > 10">
          <el-pagination
              :current-page="params.num"
              :page-size="params.size"
              :page-sizes="[10, 20, 30, 50, 100]"
              background
              layout="prev, pager, next, sizes, total"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
        </div>
      </div>
    </el-scrollbar>

    <el-dialog v-model="syncDialogShow" class="sync-dialog" title="&#x77e9;&#x9635;&#x540c;&#x6b65;&#x5165;&#x53e3;">
      <div class="sync-guide">
        <el-alert
            type="info"
            :closable="false"
            title="&#x8fd9;&#x4e2a;&#x5165;&#x53e3;&#x7ed9;&#x672c;&#x5730;&#x77e9;&#x9635;&#x5de5;&#x5177;&#x4f7f;&#x7528;&#xff1a;&#x672c;&#x5730;&#x8f6f;&#x4ef6;&#x8d1f;&#x8d23;&#x6267;&#x884c;&#x52a8;&#x4f5c;&#xff0c;Cloudflare &#x8d1f;&#x8d23;&#x4fdd;&#x5b58;&#x90ae;&#x7bb1;&#x8d44;&#x4ea7;&#x72b6;&#x6001;&#x3002;"
        />
        <div class="sync-card">
          <div>
            <strong>&#x8d26;&#x53f7;&#x8d44;&#x4ea7;&#x540c;&#x6b65; API</strong>
            <p>{{ accountSyncUrl }}</p>
          </div>
          <el-button size="small" @click="copySyncText(accountSyncUrl)">&#x590d;&#x5236;</el-button>
        </div>
        <div class="sync-card">
          <div>
            <strong>TikTok &#x6570;&#x636e;&#x540c;&#x6b65; API</strong>
            <p>{{ statsSyncUrl }}</p>
          </div>
          <el-button size="small" @click="copySyncText(statsSyncUrl)">&#x590d;&#x5236;</el-button>
        </div>
        <div class="sync-note">
          <p><b>Token &#x653e;&#x54ea;&#x91cc;&#xff1a;</b>&#x8bf7;&#x6c42;&#x5934;&#x4f7f;&#x7528; <code>x-agent-token</code>&#xff0c;&#x4e0d;&#x8981;&#x628a; Token &#x5199;&#x8fdb;&#x7f51;&#x9875;&#x94fe;&#x63a5;&#x3002;</p>
          <p><b>&#x81ea;&#x52a8;&#x521b;&#x5efa;&#xff1a;</b>&#x4f20; <code>createIfMissing: true</code> &#x540e;&#xff0c;Cloudflare &#x4f1a;&#x81ea;&#x52a8;&#x521b;&#x5efa;&#x4e0d;&#x5b58;&#x5728;&#x7684;&#x90ae;&#x7bb1;&#x8d44;&#x4ea7;&#x3002;</p>
          <p><b>&#x5b89;&#x5168;&#x8fb9;&#x754c;&#xff1a;</b>&#x8fd9;&#x91cc;&#x540c;&#x6b65;&#x90ae;&#x7bb1;&#x3001;&#x7a97;&#x53e3;&#x540d;&#x3001;TikTok&#x3001;&#x5bc6;&#x7801;&#x3001;&#x5206;&#x7ec4;&#x3001;&#x7c89;&#x4e1d;&#x64ad;&#x653e;&#x548c;&#x72b6;&#x6001;&#xff1b;&#x5bc6;&#x7801;&#x9ed8;&#x8ba4;&#x9690;&#x85cf;&#x663e;&#x793a;&#x3002;</p>
        </div>
        <div>
          <div class="example-head">
            <strong>JSON &#x793a;&#x4f8b;</strong>
            <el-button size="small" @click="copySyncText(syncExample)">&#x590d;&#x5236;&#x793a;&#x4f8b;</el-button>
          </div>
          <pre class="sync-example">{{ syncExample }}</pre>
        </div>
      </div>
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
    const data = await assetExportTxt({...params})
    const text = String(data?.text || '')
    if (!text) {
      ElMessage({message: '没有可导出的资产', type: 'warning', plain: true})
      return
    }

    await writeClipboardText(text)

    ElMessage({
      message: `已复制 ${Number(data?.total || 0)} 条${Number(data?.createdCount || 0) > 0 ? `，自动创建 token ${data.createdCount} 个` : ''}${Number(data?.emptyCount || 0) > 0 ? `，${data.emptyCount} 条 token 为空` : ''}`,
      type: 'success',
      plain: true
    })
  } catch (error) {
    ElMessage({
      message: `导出失败：${error?.message || '复制失败'}`,
      type: 'error',
      plain: true
    })
  } finally {
    exportLoading.value = false
  }
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
.asset-page {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: var(--extra-light-fill);
}

.toolbar {
  padding: 14px 16px;
  display: grid;
  gap: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}

.toolbar-title {
  display: flex;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;

  p {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }

  span {
    color: var(--el-text-color-secondary);
  }
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-input {
  width: 180px;
}

.search-input.small {
  width: 150px;
}

.select {
  width: 140px;
}

.select.small {
  width: 126px;
}

.select.creator {
  width: 136px;
}

.sync-button {
  height: 32px;
}

.export-button {
  min-width: 182px;
  height: 40px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(64, 158, 255, 0.18);
}

.tool-icon {
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
  color: var(--el-text-color-primary);
}

.tool-icon:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.table-scroll {
  height: 100%;
}

.table-wrap {
  min-height: 100%;
  padding: 14px;
}

.mail-cell {
  display: grid;
  gap: 5px;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .el-tag {
    width: fit-content;
  }
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.readonly-text {
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.password-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.open-icon {
  flex: none;
  padding: 3px;
  border-radius: 7px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  cursor: pointer;
}

.metric-input {
  width: 104px;
}

.retry-cell {
  display: grid;
  gap: 4px;

  :deep(.el-date-editor.el-input) {
    width: 138px;
  }

  small {
    color: var(--el-text-color-secondary);
    font-size: 11px;
  }
}

.sync-time {
  display: grid;
  gap: 3px;

  small {
    color: var(--el-text-color-secondary);
  }
}

.pagination {
  margin: 16px 0 8px;
  display: flex;
  justify-content: end;
}

.sync-guide {
  display: grid;
  gap: 14px;
}

.sync-card {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 13px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--extra-light-fill);

  p {
    margin: 6px 0 0;
    word-break: break-all;
    color: var(--el-text-color-secondary);
  }
}

.sync-note {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--el-color-primary-light-9);

  p {
    margin: 0;
    line-height: 1.7;
  }

  code {
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.7);
  }
}

.example-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sync-example {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  color: #dbeafe;
  background: #0f172a;
}

:deep(.sync-dialog) {
  width: min(720px, calc(100vw - 34px));
}

@media (max-width: 860px) {
  .search-input,
  .select,
  .select.small,
  .select.creator {
    width: calc(50vw - 28px);
  }
}

@media (max-width: 520px) {
  .search-input,
  .select,
  .select.small,
  .select.creator {
    width: 100%;
  }
}
</style>
