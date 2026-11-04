<template>
  <div class="sa-page">
    <div class="sa-toolbar">
      <div class="sa-actions">
        <el-button type="primary" @click="openAdd">
          <Icon icon="ion:add-outline" width="16" height="16"/>
          <span>新增</span>
        </el-button>
        <el-button @click="openBatchCreate">
          <Icon icon="fluent:link-multiple-20-regular" width="16" height="16"/>
          <span>批量建号</span>
        </el-button>
        <el-button @click="openImport">
          <Icon icon="fluent:mail-inbox-add-20-regular" width="16" height="16"/>
          <span>批量导入</span>
        </el-button>
      </div>
      <div class="sa-filters">
        <el-input v-model="params.email" clearable class="sa-search" placeholder="搜索邮箱" @keyup.enter="search" @clear="search">
          <template #prefix><Icon icon="iconoir:search" width="15" height="15"/></template>
        </el-input>
        <el-input v-model="params.name" clearable class="sa-search sa-hide-sm" placeholder="搜索备注" @keyup.enter="search" @clear="search"/>
        <el-select v-model="params.domain" class="sa-select" placeholder="全部域名" @change="search">
          <el-option label="全部域名" value=""/>
          <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
        </el-select>
        <el-select v-model="params.isDel" class="sa-select-sm" @change="search">
          <el-option label="正常" :value="0"/>
          <el-option label="已删除" :value="1"/>
        </el-select>
        <el-tooltip content="刷新"><el-button circle @click="refresh"><Icon icon="ion:reload" width="15" height="15"/></el-button></el-tooltip>
        <el-dropdown trigger="click" @command="exportAs">
          <el-button>
            <Icon icon="ph:export" width="16" height="16"/>
            <span>导出</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="links">邮箱----接码链接（TXT）</el-dropdown-item>
              <el-dropdown-item command="csv">表格（CSV）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" :disabled="selectedCount === 0" @command="batchManage">
          <el-button :disabled="selectedCount === 0">
            <span>批量管理{{ selectedCount ? ` (${selectedCount})` : '' }}</span>
            <Icon icon="mingcute:down-small-fill" width="16" height="16"/>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="copy">复制所选：邮箱----接码链接</el-dropdown-item>
              <el-dropdown-item command="download">下载所选 TXT</el-dropdown-item>
              <el-dropdown-item command="missing" divided>给没有链接的生成链接</el-dropdown-item>
              <el-dropdown-item command="reset">重置链接（旧链接失效）</el-dropdown-item>
              <el-dropdown-item command="revoke">撤销链接</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="danger" plain :disabled="selectedCount === 0" @click="deleteSelected">
          删除{{ selectedCount ? ` (${selectedCount})` : '' }}
        </el-button>
      </div>
    </div>

    <el-scrollbar ref="scrollbarRef" class="sa-scroll">
      <div class="sa-table">
        <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
          <loading/>
        </div>
        <el-table
            ref="tableRef"
            row-key="accountId"
            :data="accounts"
            :empty-text="first ? '' : '暂无子邮箱'"
            style="width: 100%;"
            @sort-change="sortChange"
            @selection-change="rows => selectedCount = rows.length"
        >
          <el-table-column width="42" type="selection" :selectable="row => !isOwnerAccount(row)"/>
          <el-table-column label="邮箱" min-width="240" prop="email" sortable="custom">
            <template #default="{row}">
              <div class="sa-email">
                <span class="sa-email-text" :title="row.email">{{ row.email }}</span>
                <Icon class="sa-copy" icon="fluent:copy-20-regular" width="15" height="15" title="复制邮箱" @click="copyText(row.email)"/>
                <el-tag v-if="isOwnerAccount(row)" type="warning" size="small">主邮箱</el-tag>
                <el-tag v-if="row.isDel === 1" type="info" size="small">已删除</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="170" prop="name" sortable="custom">
            <template #default="{row}">
              <el-input
                  v-model="row.editName"
                  class="sa-inline"
                  size="small"
                  maxlength="30"
                  placeholder="点击填写备注"
                  :disabled="row.savingName"
                  @blur="saveName(row)"
                  @keyup.enter="$event.target.blur()"
              />
            </template>
          </el-table-column>
          <el-table-column label="接码链接" min-width="230">
            <template #default="{row}">
              <div v-if="row.hasToken" class="sa-link">
                <span class="sa-link-text" :title="buildCodeUrl(row.email, row.token)">{{ shortLink(row) }}</span>
                <el-button size="small" link type="primary" @click="copyCodeUrl(row)">复制</el-button>
                <el-button size="small" link type="primary" @click="openCodePage(row)">打开</el-button>
              </div>
              <el-button v-else size="small" plain type="primary" @click="setRandomToken(row)">生成链接</el-button>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="150" prop="createTime" sortable="custom">
            <template #default="{row}">
              <span class="sa-muted">{{ formatTime(row.createTime) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="" width="60" fixed="right">
            <template #default="{row}">
              <el-dropdown trigger="click">
                <span class="sa-more"><Icon icon="mingcute:more-2-fill" width="18" height="18"/></span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="row.hasToken" @click="resetToken(row)">重新生成链接（旧链接失效）</el-dropdown-item>
                    <el-dropdown-item v-if="row.isDel !== 1 && !isOwnerAccount(row)" @click="deleteRows([row])">
                      <span style="color: var(--el-color-danger)">删除</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>

        <div class="sa-pagination" v-if="total > 0">
          <el-pagination
              :current-page="params.num"
              :page-size="params.size"
              :pager-count="pagerCount"
              :page-sizes="[20, 50, 100]"
              background
              :layout="pageLayout"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
        </div>
      </div>
    </el-scrollbar>

    <el-dialog v-model="addShow" title="新增子邮箱" width="420" @closed="resetAddForm">
      <div class="sa-dialog">
        <div class="sa-field">
          <label>邮箱</label>
          <div class="sa-email-input">
            <el-input v-model.trim="addForm.email" placeholder="前缀，例如 support"/>
            <el-select v-model="addForm.suffix" class="sa-suffix">
              <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
            </el-select>
          </div>
        </div>
        <div class="sa-field">
          <label>备注（可不填）</label>
          <el-input v-model.trim="addForm.name" maxlength="30" show-word-limit/>
        </div>
        <el-checkbox v-model="addForm.genToken">同时生成接码链接</el-checkbox>
        <el-button class="btn" type="primary" :loading="addLoading" @click="submitAdd">新增</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="batchShow" title="批量建号" width="560" @closed="resetBatch">
      <div class="sa-dialog">
        <div class="sa-batch-row">
          <el-select v-model="batchForm.suffix" class="sa-suffix">
            <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
          </el-select>
          <el-radio-group v-model="batchForm.mode">
            <el-radio-button value="random">随机生成</el-radio-button>
            <el-radio-button value="names">指定用户名</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="batchForm.mode === 'random'" class="sa-batch-row">
          <div class="sa-field"><label>数量</label><el-input-number v-model="batchForm.count" :min="1" :max="2000"/></div>
          <div class="sa-field"><label>前缀（可空）</label><el-input v-model.trim="batchForm.prefix" placeholder="如 tk" style="width: 120px"/></div>
          <div class="sa-field"><label>随机位数</label><el-input-number v-model="batchForm.length" :min="4" :max="20"/></div>
        </div>
        <el-input v-else v-model="batchForm.names" type="textarea" :autosize="{ minRows: 6, maxRows: 12 }"
                  placeholder="每行一个：用户名或完整邮箱"/>
        <el-checkbox v-model="batchForm.autoDownload">完成后自动下载 TXT（邮箱----接码链接）</el-checkbox>
        <el-button class="btn" type="primary" :loading="batchLoading" @click="submitBatch">
          {{ batchLoading ? batchProgress : '创建并生成接码链接' }}
        </el-button>
        <template v-if="batchResult.length">
          <p class="sa-tip">{{ batchSummary }}</p>
          <el-input :model-value="batchText" type="textarea" :rows="8" readonly/>
          <div class="sa-batch-row">
            <el-button @click="copyText(batchText, '已复制')">复制</el-button>
            <el-button @click="download(batchText, `接码链接-${today()}.txt`, 'text/plain;charset=utf-8')">下载 TXT</el-button>
          </div>
        </template>
      </div>
    </el-dialog>

    <el-dialog v-model="importShow" title="批量导入子邮箱" width="460" @closed="resetImportForm">
      <div class="sa-dialog">
        <p class="sa-tip">每行一个；只填前缀时自动拼接下面的域名，单次最多 200 个。要同时生成接码链接请用「批量建号」。</p>
        <el-select v-model="importForm.suffix" placeholder="默认域名">
          <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item"/>
        </el-select>
        <el-input
            v-model="importForm.text"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 14 }"
            placeholder="demo001&#10;demo002@ntmcn.com&#10;demo003"
        />
        <div class="import-result" v-if="importResult">
          <el-tag type="success">成功 {{ importResult.success.length }}</el-tag>
          <el-tag v-if="importResult.failed.length" type="danger">失败 {{ importResult.failed.length }}</el-tag>
        </div>
        <el-button class="btn" type="primary" :loading="importLoading" @click="submitImport">开始导入</el-button>
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
  subAccountBatchCreate,
  subAccountBatchToken,
  subAccountDelete,
  subAccountGenToken,
  subAccountImport,
  subAccountList,
  subAccountSetName
} from '@/request/sub-account.js'

defineOptions({
  name: 'sub-account'
})

const CODE_BASE = 'https://mail.ntmcn.com'

const settingStore = useSettingStore()
const route = useRoute()
const domainOptions = computed(() => settingStore.domainList || [])
const accounts = ref([])
const tableRef = ref({})
const scrollbarRef = ref(null)
const tableLoading = ref(true)
const first = ref(true)
const total = ref(0)
const selectedCount = ref(0)
const pagerCount = ref(window.innerWidth < 768 ? 7 : 11)
const pageLayout = ref(window.innerWidth < 768 ? 'pager' : 'total, prev, pager, next, sizes')

const addShow = ref(false)
const importShow = ref(false)
const addLoading = ref(false)
const importLoading = ref(false)
const importResult = ref(null)

const params = reactive({
  email: '',
  name: '',
  domain: '',
  isDel: 0,
  num: 1,
  size: 20,
  sortBy: 'accountId',
  order: 'desc'
})

const addForm = reactive({email: '', suffix: '', name: '', genToken: true})
const importForm = reactive({text: '', suffix: ''})

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
window.addEventListener('mail-insights-changed', refreshQuiet)
adjustPage()
getList(true)

onBeforeUnmount(() => {
  window.removeEventListener('resize', adjustPage)
  window.removeEventListener('mail-insights-changed', refreshQuiet)
})

function adjustPage() {
  pagerCount.value = window.innerWidth < 768 ? 7 : 11
  pageLayout.value = window.innerWidth < 768 ? 'pager' : 'total, prev, pager, next, sizes'
}

function search() {
  params.num = 1
  getList(true)
}

function refresh() {
  params.email = ''
  params.name = ''
  params.domain = ''
  params.isDel = 0
  params.num = 1
  getList(true)
}

function refreshQuiet() {
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

function sortChange({prop, order}) {
  params.sortBy = prop || 'accountId'
  params.order = order === 'ascending' ? 'asc' : 'desc'
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
      savingName: false,
      token: row.token || ''
    }))
    total.value = data.total || 0
    selectedCount.value = 0
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

async function submitAdd() {
  const email = buildEmail(addForm.email, addForm.suffix)
  if (!validateEmail(email)) return

  addLoading.value = true
  try {
    const row = await subAccountAdd({email, name: addForm.name})
    if (addForm.genToken && row?.accountId) {
      const data = await subAccountGenToken(row.accountId)
      await copyText(buildCodeUrl(email, data.token), '已新增，接码链接已复制')
    } else {
      ElMessage({message: '新增成功', type: 'success', plain: true})
    }
    addShow.value = false
    getList(true)
  } catch (e) {
    // 接口错误已由全局提示
  } finally {
    addLoading.value = false
  }
}

function openImport() {
  importShow.value = true
}

function openBatchTool() {
  window.open('/batch-tool', '_blank')
}

// ===== 批量建号（页内弹窗）=====
const batchShow = ref(false)
const batchLoading = ref(false)
const batchProgress = ref('')
const batchResult = ref([])
const batchForm = reactive({suffix: '', mode: 'random', count: 20, prefix: '', length: 8, names: '', autoDownload: true})

watch(domainOptions, (list) => {
  if (!batchForm.suffix && list.length > 0) batchForm.suffix = list[0]
}, {immediate: true})

const batchText = computed(() => batchResult.value.filter(x => x.link).map(x => `${x.email}----${x.link}`).join('\n'))
const batchSummary = computed(() => {
  const cnt = {}
  batchResult.value.forEach(x => { cnt[x.status] = (cnt[x.status] || 0) + 1 })
  const parts = [`新建 ${cnt.created || 0}`]
  if (cnt.restored) parts.push(`恢复 ${cnt.restored}`)
  if (cnt.exists) parts.push(`已存在 ${cnt.exists}`)
  if (cnt.invalid) parts.push(`格式不对 ${cnt.invalid}`)
  if (cnt.failed) parts.push(`失败 ${cnt.failed}`)
  return parts.join('，')
})

function openBatchCreate() {
  batchShow.value = true
}

function resetBatch() {
  if (batchLoading.value) return
  batchResult.value = []
}

async function submitBatch() {
  const domain = cleanDomain(batchForm.suffix)
  if (!domain) return
  const jobs = []
  if (batchForm.mode === 'names') {
    const names = String(batchForm.names || '').split(/[\s,;，；]+/).filter(Boolean)
    if (!names.length) {
      ElMessage({message: '请填写用户名', type: 'warning', plain: true})
      return
    }
    for (let i = 0; i < names.length; i += 100) jobs.push({names: names.slice(i, i + 100).join('\n')})
  } else {
    for (let left = Number(batchForm.count || 0); left > 0; left -= 100) {
      jobs.push({count: Math.min(100, left), prefix: batchForm.prefix, length: batchForm.length})
    }
  }
  batchLoading.value = true
  batchResult.value = []
  try {
    for (let i = 0; i < jobs.length; i++) {
      batchProgress.value = `处理中 ${i + 1}/${jobs.length} 批…`
      const data = await subAccountBatchCreate({...jobs[i], domain, base: CODE_BASE})
      batchResult.value = [...batchResult.value, ...(data.list || [])]
    }
    ElMessage({message: `完成：${batchSummary.value}`, type: 'success', plain: true})
    if (batchForm.autoDownload && batchText.value) download(batchText.value, `接码链接-${domain}-${today()}.txt`, 'text/plain;charset=utf-8')
    getList(true)
  } catch (e) {
    // 已提示；已完成的部分保留在结果里
  } finally {
    batchLoading.value = false
  }
}

// ===== 勾选后批量管理 =====
async function batchManage(command) {
  const rows = tableRef.value.getSelectionRows?.() || []
  if (!rows.length) return
  const ids = rows.map(row => row.accountId)
  if (command === 'copy' || command === 'download') {
    const data = await subAccountBatchToken(ids, 'get')
    const list = (data.list || []).filter(x => x.link)
    if (!list.length) {
      ElMessage({message: '所选邮箱都还没有接码链接，请先「给没有链接的生成链接」', type: 'warning', plain: true})
      return
    }
    const text = list.map(x => `${x.email}----${x.link}`).join('\n')
    const skipped = rows.length - list.length
    if (command === 'copy') await copyText(text, `已复制 ${list.length} 条${skipped ? `（${skipped} 个没有链接）` : ''}`)
    else download(text, `接码链接-${today()}.txt`, 'text/plain;charset=utf-8')
    return
  }
  const labels = {missing: '给没有链接的邮箱生成链接', reset: '重置链接，旧链接会立即失效', revoke: '撤销链接，撤销后这些链接无法再取码'}
  try {
    await ElMessageBox.confirm(`确认对选中的 ${rows.length} 个邮箱${labels[command]}？`, {confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning'})
  } catch (e) {
    return
  }
  const data = await subAccountBatchToken(ids, command)
  const list = data.list || []
  const changed = list.filter(x => ['created', 'reset', 'revoked'].includes(x.status)).length
  ElMessage({message: `已处理 ${changed} 个`, type: 'success', plain: true})
  if (command !== 'revoke') {
    const text = list.filter(x => x.link).map(x => `${x.email}----${x.link}`).join('\n')
    if (text) await copyText(text, `已处理 ${changed} 个，所选链接已复制`)
  }
  getList(false)
}

function submitImport() {
  const text = buildImportText(importForm.text, importForm.suffix)
  if (!text) {
    ElMessage({message: '请输入要导入的邮箱', type: 'error', plain: true})
    return
  }

  importLoading.value = true
  subAccountImport({text}).then(data => {
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

function saveName(row) {
  const next = String(row.editName || '').trim()
  if (next === (row.name || '')) return
  row.savingName = true
  subAccountSetName(row.accountId, next).then(() => {
    row.name = next
    ElMessage({message: '备注已保存', type: 'success', plain: true})
  }).catch(() => {
    row.editName = row.name || ''
  }).finally(() => {
    row.savingName = false
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
  ElMessageBox.confirm(`确认删除 ${list.length} 个子邮箱？删除后对应接码链接也会失效。`, {
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
  }).catch(() => {})
}

function exportAs(command) {
  if (command === 'csv') exportCsv()
  else exportLinks()
}

async function exportCsv() {
  const rows = await loadAllRows()
  if (rows.length === 0) {
    ElMessage({message: '没有可导出的数据', type: 'warning', plain: true})
    return
  }
  const headers = ['邮箱', '备注', '接码链接', '创建时间']
  const body = rows.map(row => [
    row.email,
    row.name || '',
    row.token ? buildCodeUrl(row.email, row.token) : '',
    formatTime(row.createTime)
  ])
  const csv = [headers, ...body].map(row => row.map(csvEscape).join(',')).join('\n')
  download(`﻿${csv}`, `子邮箱-${today()}.csv`, 'text/csv;charset=utf-8')
}

async function exportLinks() {
  const rows = await loadAllRows()
  const withToken = rows.filter(row => row.token)
  if (withToken.length === 0) {
    ElMessage({message: '没有带接码链接的邮箱', type: 'warning', plain: true})
    return
  }
  const text = withToken.map(row => `${row.email}----${buildCodeUrl(row.email, row.token)}`).join('\n')
  download(text, `接码链接-${today()}.txt`, 'text/plain;charset=utf-8')
  const skipped = rows.length - withToken.length
  try {
    await navigator.clipboard.writeText(text)
    ElMessage({message: `已导出并复制 ${withToken.length} 条${skipped ? `（${skipped} 个没有链接未导出）` : ''}`, type: 'success', plain: true})
  } catch (e) {
    ElMessage({message: `已导出 ${withToken.length} 条`, type: 'success', plain: true})
  }
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
    copyText(buildCodeUrl(row.email, data.token), '接码链接已生成并复制')
  })
}

function resetToken(row) {
  ElMessageBox.confirm(`重新生成后，${row.email} 的旧接码链接会立即失效，确认？`, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => setRandomToken(row)).catch(() => {})
}

function copyCodeUrl(row) {
  if (!row.token) return
  copyText(buildCodeUrl(row.email, row.token), '接码链接已复制')
}

function openCodePage(row) {
  if (!row.token) return
  window.open(buildCodeUrl(row.email, row.token, 'html'), '_blank')
}

function buildCodeUrl(email, token, format = 'json') {
  const query = new URLSearchParams({username: email, token})
  if (format) query.set('format', format)
  return `${CODE_BASE}/getNewTkMailCode?${query.toString()}`
}

function shortLink(row) {
  return `…/getNewTkMailCode?username=${row.email}`
}

async function copyText(text, message = '复制成功') {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage({message, type: 'success', plain: true})
  } catch (e) {
    ElMessage({message: '浏览器不允许自动复制，请手动复制', type: 'warning', plain: true})
  }
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], {type}))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function today() {
  return new Date().toISOString().slice(0, 10)
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
  addForm.genToken = true
  addForm.suffix = domainOptions.value[0] || ''
}

function resetImportForm() {
  importForm.text = ''
  importForm.suffix = domainOptions.value[0] || ''
  importResult.value = null
}

function formatTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : '-'
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
.sa-page {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sa-toolbar {
  padding: 10px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);

  .el-button {
    gap: 4px;
  }

  :deep(.el-button > span) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.sa-actions, .sa-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.sa-search {
  width: 180px;
}

.sa-select {
  width: 140px;
}

.sa-select-sm {
  width: 92px;
}

.sa-hide-sm {
  @media (max-width: 900px) {
    display: none;
  }
}

.sa-scroll {
  flex: 1;
  min-height: 0;
}

.sa-table {
  min-height: 100%;
  position: relative;
}

.sa-email {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sa-email-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.sa-copy {
  flex-shrink: 0;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  opacity: 0;
  transition: opacity .15s;
}

:deep(.el-table__row:hover) .sa-copy {
  opacity: 1;
}

.sa-inline {
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

.sa-link {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.sa-link-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-right: 4px;
}

.sa-muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.sa-more {
  cursor: pointer;
  display: inline-flex;
  padding: 4px;
  border-radius: 4px;
  color: var(--el-text-color-secondary);

  &:hover {
    background: var(--el-fill-color);
  }
}

.sa-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 14px 16px 20px;
}

.sa-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .btn {
    width: 100%;
  }
}

.sa-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.sa-email-input {
  display: flex;
  gap: 8px;
}

.sa-suffix {
  width: 170px;
  flex-shrink: 0;
}

.sa-batch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.sa-tip {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.import-result {
  display: flex;
  gap: 8px;
}

.loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-bg-color);
  transition: opacity .2s;
}

.loading-show {
  opacity: 1;
  pointer-events: auto;
}

.loading-hide {
  opacity: 0;
  pointer-events: none;
}
</style>
