<!--
  STABLE GUARD:
  子邮箱管理是本地矩阵工具接码、Token 创建、资产邮箱接管的核心页面。
  禁止删除批量创建、Token、TikTok 用户名/资产关联等稳定功能。
  修改前必须先阅读 cloud-mail/AGENTS.md 和 STABLE_FEATURES_DO_NOT_BREAK.md。
-->
<template>
  <div class="sub-account-box">
    <div class="header-actions">
      <Icon class="icon" icon="ion:add-outline" width="23" height="23" title="新增子邮箱" @click="openAdd"/>
      <Icon class="icon" icon="fluent:mail-inbox-add-20-regular" width="22" height="22" title="批量导入" @click="openImport"/>
      <Icon class="icon" icon="mdi:database-sync-outline" width="21" height="21" title="从资产补建子邮箱" @click="ensureAssets"/>
      <Icon class="icon" icon="fluent:mail-search-24-regular" width="22" height="22" title="扫描未建档邮箱" @click="openScan"/>
      <div class="search">
        <el-input v-model="params.email" clearable class="search-input" placeholder="搜索子邮箱" @keyup.enter="search" @clear="search"/>
      </div>
      <div class="search user-search">
        <el-input v-model="params.userEmail" clearable class="search-input" placeholder="搜索归属用户" @keyup.enter="search" @clear="search"/>
      </div>
      <el-select v-model="params.domain" class="domain-select" placeholder="全部域名" @change="search">
        <el-option label="全部域名" value=""/>
        <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
      </el-select>
      <el-select v-model="params.isDel" class="status-select" placeholder="状态" @change="search">
        <el-option label="正常" :value="0"/>
        <el-option label="已删除" :value="1"/>
        <el-option label="全部" :value="-1"/>
      </el-select>
      <Icon class="icon" icon="iconoir:search" width="20" height="20" title="搜索" @click="search"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" title="刷新" @click="refresh"/>
      <Icon class="icon" icon="ph:export" width="21" height="21" title="导出 CSV" @click="exportCsv"/>
      <Icon class="icon danger" icon="uiw:delete" width="16" height="16" title="删除选中" @click="deleteSelected"/>
    </div>

    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div class="table-wrap">
        <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
          <loading/>
        </div>
        <el-table
            ref="tableRef"
            row-key="accountId"
            :data="accounts"
            :empty-text="first ? '' : '暂无子邮箱'"
            style="width: 100%;"
        >
          <el-table-column width="42" type="selection" :selectable="row => !isOwnerAccount(row)"/>
          <el-table-column label="子邮箱" min-width="230" show-overflow-tooltip>
            <template #default="props">
              <div class="email-cell">
                <span>{{ props.row.email }}</span>
                <el-tag v-if="isOwnerAccount(props.row)" type="warning" size="small">主邮箱</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="域名" width="130">
            <template #default="props">
              <el-tag size="small">{{ getDomain(props.row.email) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="150" show-overflow-tooltip>
            <template #default="props">
              <el-input
                  v-model="props.row.editName"
                  size="small"
                  maxlength="30"
                  placeholder="备注"
                  :disabled="props.row.savingName"
                  @blur="saveInlineName(props.row)"
                  @keyup.enter="$event.target.blur()"
              />
            </template>
          </el-table-column>
          <el-table-column label="接码 Token" width="110">
            <template #default="props">
              <el-tag v-if="props.row.hasToken" type="success" disable-transitions>已设置</el-tag>
              <el-tag v-else type="info" disable-transitions>未设置</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="归属用户" min-width="210" show-overflow-tooltip>
            <template #default="props">
              <span>{{ props.row.userEmail || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="props">
              <el-tag v-if="props.row.isDel === 1" type="info" disable-transitions>已删除</el-tag>
              <el-tag v-else-if="props.row.status === 1" type="danger" disable-transitions>停用</el-tag>
              <el-tag v-else type="primary" disable-transitions>正常</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="TikTok" min-width="210">
            <template #default="props">
              <div class="tiktok-cell">
                <el-input
                    v-model="props.row.editTiktokUsername"
                    class="tiktok-input"
                    size="small"
                    maxlength="80"
                    placeholder="用户名或主页链接"
                    :disabled="props.row.savingTiktok"
                    @blur="saveInlineTikTok(props.row)"
                    @keyup.enter="$event.target.blur()"
                />
                <el-tooltip v-if="props.row.tiktokUrl" effect="dark" content="打开 TikTok 主页">
                  <Icon
                      class="tiktok-open"
                      icon="ri:send-plane-line"
                      width="18"
                      height="18"
                      @click="openTikTok(props.row)"
                  />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="155">
            <template #default="props">
              {{ formatTime(props.row.createTime) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="112" fixed="right">
            <template #default="props">
              <el-dropdown trigger="click">
                <el-button size="small" type="primary">操作</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="setRandomToken(props.row)">设置随机 Token</el-dropdown-item>
                    <el-dropdown-item @click="copyCodeUrl(props.row)">复制接码链接</el-dropdown-item>
                    <el-dropdown-item @click="openCodePage(props.row)">打开接码网页</el-dropdown-item>
                    <el-dropdown-item v-if="props.row.isDel !== 1 && !isOwnerAccount(props.row)" @click="deleteRows([props.row])">
                      删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination" v-if="total > 10">
          <el-pagination
              :current-page="params.num"
              :page-size="params.size"
              :pager-count="pagerCount"
              :page-sizes="[10, 20, 30, 50, 100]"
              background
              :layout="pageLayout"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
        </div>
      </div>
    </el-scrollbar>

    <el-dialog v-model="addShow" title="新增子邮箱" @closed="resetAddForm">
      <div class="dialog-box">
        <el-input v-model.trim="addForm.email" placeholder="邮箱前缀或完整邮箱"/>
        <el-select v-model="addForm.suffix" placeholder="选择域名">
          <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
        </el-select>
        <el-input v-model.trim="addForm.name" maxlength="30" show-word-limit placeholder="备注，可不填"/>
        <el-input v-model.trim="addForm.userEmail" placeholder="归属用户邮箱，不填则归属当前登录用户"/>
        <el-button class="btn" type="primary" :loading="addLoading" @click="submitAdd">新增</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="importShow" title="批量导入子邮箱" @closed="resetImportForm">
      <div class="dialog-box">
        <el-alert
            type="info"
            :closable="false"
            title="每行一个邮箱；只填前缀时会自动拼接下面选择的域名。单次最多 200 个。"
        />
        <el-select v-model="importForm.suffix" placeholder="默认拼接域名">
          <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
        </el-select>
        <el-input v-model="importForm.userEmail" placeholder="归属用户邮箱，不填则归属当前登录用户"/>
        <el-input
            v-model="importForm.text"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 14 }"
            placeholder="demo001&#10;demo002@orz.gay&#10;demo003"
        />
        <div class="import-result" v-if="importResult">
          <el-tag type="success">成功 {{ importResult.success.length }}</el-tag>
          <el-tag v-if="importResult.failed.length" type="danger">失败 {{ importResult.failed.length }}</el-tag>
        </div>
        <el-button class="btn" type="primary" :loading="importLoading" @click="submitImport">开始导入</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="scanShow" title="扫描未建档邮箱" class="scan-dialog" width="760px">
      <div class="scan-box">
        <el-alert
            type="info"
            :closable="false"
            title="只扫描 feilong168.com、baofa.de、ntmcn.com。先预览，不会自动创建。"
        />
        <div class="scan-actions">
          <el-select v-model="scanForm.domain" class="scan-domain-select" placeholder="全部允许域名">
            <el-option label="全部允许域名" value=""/>
            <el-option v-for="item in managedDomainOptions" :key="item" :label="item" :value="item"/>
          </el-select>
          <el-button :loading="scanLoading" @click="scanUnmanaged(false)">扫描</el-button>
          <el-button type="primary" :disabled="!scanResult.list.length" :loading="scanCreateLoading" @click="scanUnmanaged(true)">
            创建全部
          </el-button>
        </div>
        <div class="scan-summary" v-if="scanResult.total">
          发现 {{ scanResult.total }} 个未建档邮箱
        </div>
        <el-table :data="scanResult.list" max-height="360" empty-text="暂无未建档邮箱">
          <el-table-column prop="email" label="邮箱" min-width="250" show-overflow-tooltip/>
          <el-table-column prop="domain" label="域名" width="140"/>
          <el-table-column prop="mailCount" label="邮件数" width="90"/>
          <el-table-column prop="latestEmailTime" label="最后收件时间" min-width="170"/>
        </el-table>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import {computed, defineOptions, onBeforeUnmount, reactive, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {Icon} from '@iconify/vue'
import loading from '@/components/loading/index.vue'
import {tzDayjs} from '@/utils/day.js'
import {isEmail} from '@/utils/verify-utils.js'
import {useSettingStore} from '@/store/setting.js'
import {
  subAccountAdd,
  subAccountDelete,
  subAccountEnsureAssets,
  subAccountGenToken,
  subAccountGetToken,
  subAccountImport,
  subAccountList,
  subAccountScanUnmanaged,
  subAccountSetName,
  subAccountSetTiktok
} from '@/request/sub-account.js'

defineOptions({
  name: 'sub-account'
})

const settingStore = useSettingStore()
const route = useRoute()
const domainOptions = computed(() => settingStore.domainList || [])
const accounts = ref([])
const tableRef = ref({})
const scrollbarRef = ref(null)
const tableLoading = ref(true)
const first = ref(true)
const total = ref(0)
const pagerCount = ref(window.innerWidth < 768 ? 7 : 11)
const pageLayout = ref(window.innerWidth < 768 ? 'pager' : 'prev, pager, next, sizes, total')

const addShow = ref(false)
const importShow = ref(false)
const scanShow = ref(false)
const addLoading = ref(false)
const importLoading = ref(false)
const scanLoading = ref(false)
const scanCreateLoading = ref(false)
const importResult = ref(null)
const managedDomainOptions = ['feilong168.com', 'baofa.de', 'ntmcn.com']

const params = reactive({
  email: '',
  userEmail: '',
  domain: '',
  isDel: 0,
  num: 1,
  size: 20
})

const addForm = reactive({
  email: '',
  suffix: '',
  name: '',
  userEmail: ''
})

const importForm = reactive({
  text: '',
  suffix: '',
  userEmail: ''
})

const scanForm = reactive({
  domain: ''
})

const scanResult = reactive({
  list: [],
  total: 0,
  created: [],
  restored: [],
  existing: [],
  failed: []
})

watch(domainOptions, (list) => {
  if (!addForm.suffix && list.length > 0) addForm.suffix = list[0]
  if (!importForm.suffix && list.length > 0) importForm.suffix = list[0]
}, {immediate: true})

watch(() => route.query.domain, (domain) => {
  if (domain === undefined) return
  params.domain = domain ? `@${cleanDomain(domain)}` : ''
  search()
}, {immediate: true})

window.addEventListener('resize', adjustPage)
window.addEventListener('mail-insights-changed', refreshInsights)
adjustPage()
getList(true)

onBeforeUnmount(() => {
  window.removeEventListener('resize', adjustPage)
  window.removeEventListener('mail-insights-changed', refreshInsights)
})

function adjustPage() {
  pagerCount.value = window.innerWidth < 768 ? 7 : 11
  pageLayout.value = window.innerWidth < 768 ? 'pager' : 'prev, pager, next, sizes, total'
}

function search() {
  params.num = 1
  getList(true)
}

function refresh() {
  params.email = ''
  params.userEmail = ''
  params.domain = ''
  params.isDel = 0
  params.num = 1
  getList(true)
}

function refreshInsights() {
  getList(false)
}

function numChange(num) {
  params.num = num
  getList(true)
}

function sizeChange(size) {
  params.size = size
  params.num = 1
  getList(true)
}

function getList(showLoading = false) {
  if (showLoading) tableLoading.value = true
  const query = {...params, domain: cleanDomain(params.domain)}
  subAccountList(query).then(data => {
    accounts.value = (data.list || []).map(row => ({
      ...row,
      editName: row.name || '',
      editTiktokUsername: row.tiktokUsername || '',
      savingName: false,
      savingTiktok: false,
      token: ''
    }))
    total.value = data.total || 0
    scrollbarRef.value?.setScrollTop(0)
  }).finally(() => {
    tableLoading.value = false
    setTimeout(() => {
      first.value = false
    }, 200)
  })
}

function openAdd() {
  addShow.value = true
}

function submitAdd() {
  const email = buildEmail(addForm.email, addForm.suffix)
  if (!validateEmail(email)) return

  addLoading.value = true
  subAccountAdd({
    email,
    name: addForm.name,
    userEmail: addForm.userEmail || undefined
  }).then(() => {
    ElMessage({message: '新增成功', type: 'success', plain: true})
    addShow.value = false
    getList(true)
  }).finally(() => {
    addLoading.value = false
  })
}

function openImport() {
  importShow.value = true
}

function submitImport() {
  const text = buildImportText(importForm.text, importForm.suffix)
  if (!text) {
    ElMessage({message: '请输入要导入的邮箱', type: 'error', plain: true})
    return
  }

  importLoading.value = true
  subAccountImport({
    text,
    userEmail: importForm.userEmail || undefined
  }).then(data => {
    importResult.value = data
    ElMessage({
      message: `导入完成：成功 ${data.success.length} 个，失败 ${data.failed.length} 个`,
      type: data.failed.length ? 'warning' : 'success',
      plain: true
    })
    getList(true)
  }).finally(() => {
    importLoading.value = false
  })
}

function ensureAssets() {
  const domain = cleanDomain(params.domain)
  const scopeText = domain ? `当前域名 ${domain}` : '全部已配置域名'
  ElMessageBox.confirm(`确认从资产数据补建子邮箱？范围：${scopeText}。不会从收件箱垃圾邮件自动创建。`, {
    confirmButtonText: '开始补建',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    subAccountEnsureAssets({
      domain,
      userEmail: params.userEmail || undefined
    }).then(data => {
      ElMessage({
        message: `补建完成：新增 ${data.created.length}，恢复 ${data.restored.length}，已存在 ${data.existing.length}，失败 ${data.failed.length}`,
        type: data.failed.length ? 'warning' : 'success',
        plain: true
      })
      getList(true)
    })
  })
}

function openScan() {
  scanShow.value = true
  if (!scanResult.list.length) {
    scanUnmanaged(false)
  }
}

function resetScanResult(data = {}) {
  scanResult.list = data.list || []
  scanResult.total = data.total || 0
  scanResult.created = data.created || []
  scanResult.restored = data.restored || []
  scanResult.existing = data.existing || []
  scanResult.failed = data.failed || []
}

function scanUnmanaged(create = false) {
  const loadingRef = create ? scanCreateLoading : scanLoading
  loadingRef.value = true
  subAccountScanUnmanaged({
    domain: scanForm.domain || '',
    limit: 1000,
    create,
    ensureToken: false
  }).then(data => {
    resetScanResult(data)
    if (create) {
      ElMessage({
        message: `创建完成：新增 ${data.created.length}，恢复 ${data.restored.length}，已存在 ${data.existing.length}，失败 ${data.failed.length}`,
        type: data.failed.length ? 'warning' : 'success',
        plain: true
      })
      getList(true)
      window.dispatchEvent(new CustomEvent('mail-insights-changed'))
    }
  }).finally(() => {
    loadingRef.value = false
  })
}

function saveInlineName(row) {
  const nextName = String(row.editName || '').trim()
  if (nextName === (row.name || '')) {
    return
  }

  row.savingName = true
  subAccountSetName(row.accountId, nextName).then(() => {
    row.name = nextName
    row.editName = nextName
    ElMessage({message: '备注成功', type: 'success', plain: true})
  }).catch(() => {
    row.editName = row.name || ''
  }).finally(() => {
    row.savingName = false
  })
}

function saveInlineTikTok(row) {
  const nextUsername = String(row.editTiktokUsername || '').trim()
  if (nextUsername === (row.tiktokUsername || '')) {
    return
  }

  row.savingTiktok = true
  subAccountSetTiktok(row.accountId, nextUsername).then(data => {
    row.tiktokUsername = data.tiktokUsername || ''
    row.editTiktokUsername = row.tiktokUsername
    row.tiktokUrl = data.tiktokUrl || ''
    ElMessage({message: 'TikTok 用户名保存成功', type: 'success', plain: true})
  }).catch(() => {
    row.editTiktokUsername = row.tiktokUsername || ''
  }).finally(() => {
    row.savingTiktok = false
  })
}

function deleteSelected() {
  const rows = tableRef.value.getSelectionRows?.() || []
  deleteRows(rows)
}

function deleteRows(rows) {
  const list = rows.filter(row => !isOwnerAccount(row))
  if (list.length === 0) {
    ElMessage({message: '没有可删除的子邮箱', type: 'warning', plain: true})
    return
  }
  ElMessageBox.confirm(`确认删除 ${list.length} 个子邮箱？`, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    subAccountDelete(list.map(row => row.accountId)).then(data => {
      ElMessage({
        message: `删除成功 ${data.deleted} 个${data.protected ? `，保护主邮箱 ${data.protected} 个` : ''}`,
        type: 'success',
        plain: true
      })
      getList(true)
    })
  })
}

async function exportCsv() {
  const rows = await loadAllRows()
  if (rows.length === 0) {
    ElMessage({message: '没有可导出的数据', type: 'warning', plain: true})
    return
  }

  const headers = ['子邮箱', '域名', '备注', '归属用户', '状态', 'TikTok用户名', 'TikTok链接', '创建时间']
  const body = rows.map(row => [
    row.email,
    getDomain(row.email),
    row.name || '',
    row.userEmail || '',
    row.isDel === 1 ? '已删除' : '正常',
    row.tiktokUsername || '',
    row.tiktokUrl || '',
    formatTime(row.createTime)
  ])
  const csv = [headers, ...body].map(row => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], {type: 'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sub-accounts-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function loadAllRows() {
  const query = {...params, domain: cleanDomain(params.domain), num: 1, size: 100}
  const firstPage = await subAccountList(query)
  const rows = [...(firstPage.list || [])]
  const pageCount = Math.ceil((firstPage.total || 0) / 100)
  for (let num = 2; num <= pageCount; num++) {
    const data = await subAccountList({...query, num})
    rows.push(...(data.list || []))
  }
  return rows
}

function setRandomToken(row) {
  subAccountGenToken(row.accountId).then(data => {
    row.token = data.token
    row.hasToken = true
    copyText(buildCodeUrl(row.email, data.token))
    ElMessage({
      message: '随机 Token 已设置，旧 Token 已失效',
      type: 'success',
      plain: true
    })
  })
}

async function getRowToken(row) {
  if (row.token) {
    return row.token
  }
  if (!row.hasToken) {
    ElMessage({message: '请先设置随机 Token', type: 'warning', plain: true})
    return ''
  }
  const data = await subAccountGetToken(row.accountId)
  row.token = data.token || ''
  row.hasToken = !!data.hasToken
  if (!row.token) {
    ElMessage({message: '请先设置随机 Token', type: 'warning', plain: true})
  }
  return row.token
}

async function copyCodeUrl(row) {
  const token = await getRowToken(row)
  if (!token) return
  copyText(buildCodeUrl(row.email, token))
}

async function openCodePage(row) {
  const token = await getRowToken(row)
  if (!token) return
  window.open(buildCodeUrl(row.email, token, 'html'), '_blank')
}

function openTikTok(row) {
  if (!row.tiktokUrl) return
  window.open(row.tiktokUrl, '_blank', 'noopener,noreferrer')
}

function buildCodeUrl(email, token, format = '') {
  const query = new URLSearchParams({
    username: email,
    token
  })
  if (format) query.set('format', format)
  return `https://212202.xyz/getNewTkMailCode?${query.toString()}`
}

async function copyText(text) {
  await navigator.clipboard.writeText(text)
  ElMessage({message: '复制成功', type: 'success', plain: true})
}

function buildEmail(value, suffix) {
  const email = String(value || '').trim().toLowerCase()
  if (!email) return ''
  if (email.includes('@')) return email
  return `${email}${suffix || ''}`.toLowerCase()
}

function buildImportText(text, suffix) {
  return String(text || '')
      .split(/[\s,;，；]+/)
      .map(item => buildEmail(item, suffix))
      .filter(Boolean)
      .join('\n')
}

function validateEmail(email) {
  if (!email) {
    ElMessage({message: '请输入邮箱', type: 'error', plain: true})
    return false
  }
  if (!isEmail(email)) {
    ElMessage({message: '邮箱格式不正确', type: 'error', plain: true})
    return false
  }
  return true
}

function resetAddForm() {
  addForm.email = ''
  addForm.name = ''
  addForm.userEmail = ''
  addForm.suffix = domainOptions.value[0] || ''
}

function resetImportForm() {
  importForm.text = ''
  importForm.userEmail = ''
  importForm.suffix = domainOptions.value[0] || ''
  importResult.value = null
}

function formatTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}

function getDomain(email) {
  return String(email || '').split('@')[1] || '-'
}

function cleanDomain(domain) {
  return String(domain || '').replace(/^@/, '')
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function isOwnerAccount(row) {
  return row.email && row.userEmail && row.email.toLowerCase() === row.userEmail.toLowerCase()
}
</script>

<style lang="scss" scoped>
.sub-account-box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: var(--header-actions-border);
  font-size: 18px;

  .icon {
    cursor: pointer;
  }

  .danger {
    color: var(--el-color-danger);
  }
}

.search {
  :deep(.el-input-group) {
    height: 28px;
  }

  :deep(.el-input__inner) {
    height: 28px;
  }
}

.search-input {
  width: min(210px, calc(100vw - 140px));
}

.user-search {
  @media (max-width: 820px) {
    display: none;
  }
}

.domain-select {
  width: 150px;
}

.status-select {
  width: 96px;
}

.scrollbar {
  width: 100%;
  overflow: auto;
  height: calc(100% - 50px);

  @media (max-width: 767px) {
    height: calc(100% - 92px);
  }
}

.table-wrap {
  min-height: 100%;
  position: relative;
}

.email-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tiktok-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.tiktok-input {
  max-width: 168px;
}

.tiktok-open {
  padding: 3px;
  border-radius: 6px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  cursor: pointer;
}

.tiktok-open:hover {
  background: var(--el-color-primary-light-8);
}

.pagination {
  margin-top: 15px;
  margin-bottom: 20px;
  padding-right: 30px;
  width: 100%;
  display: flex;
  justify-content: end;

  @media (max-width: 767px) {
    padding-right: 10px;
  }
}

.dialog-box {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.btn {
  width: 100%;
}

.import-result {
  display: flex;
  gap: 8px;
}

.scan-box {
  display: grid;
  gap: 14px;
}

.scan-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scan-domain-select {
  width: 190px;
}

.scan-summary {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.loading {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--loadding-background);
  left: 0;
  z-index: 2;
  top: 0;
  width: 100%;
  height: 100%;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

:deep(.el-dialog) {
  width: 430px !important;

  @media (max-width: 470px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.scan-dialog) {
  width: min(760px, calc(100% - 40px)) !important;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}
</style>
