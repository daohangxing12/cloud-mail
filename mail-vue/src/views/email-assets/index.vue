<template>
  <div class="email-assets">
    <div class="toolbar">
      <div class="title">
        <h2>邮箱资产</h2>
        <p>这里看账号邮箱、比特窗口、TikTok 资产和接码状态。</p>
      </div>
      <div class="filters">
        <el-select v-model="params.domain" clearable placeholder="全部域名" @change="search">
          <el-option v-for="item in domainOptions" :key="item" :label="item" :value="cleanDomain(item)"/>
        </el-select>
        <el-select v-model="params.creatorStatus" clearable placeholder="中视频状态" @change="search">
          <el-option label="已加入" value="joined"/>
          <el-option label="被拒" value="rejected"/>
          <el-option label="到期可重申" value="retryReady"/>
          <el-option label="未识别" value="unrecognized"/>
        </el-select>
        <el-input v-model="params.keyword" clearable placeholder="邮箱 / 备注 / 用户名 / Bit ID" @keyup.enter="search" @clear="search"/>
        <el-checkbox v-model="params.assetOnly" @change="search">只看资产</el-checkbox>
        <el-checkbox v-model="params.configuredOnly" @change="search">只看已接管域名</el-checkbox>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button :loading="scanLoading" type="success" plain @click="scanCreatorRewards">扫描中视频邮件</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" style="width: 100%">
      <el-table-column prop="email" label="邮箱" min-width="230" show-overflow-tooltip/>
      <el-table-column prop="domain" label="域名" width="150">
        <template #default="scope">
          <el-tag :type="scope.row.canReceive ? 'success' : 'info'" size="small">
            {{ scope.row.domain }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="备注 / 分组" min-width="150" show-overflow-tooltip/>
      <el-table-column prop="bitBrowserId" label="Bit窗口ID" min-width="180" show-overflow-tooltip/>
      <el-table-column prop="tiktokUsername" label="TikTok" min-width="140" show-overflow-tooltip/>
      <el-table-column label="中视频" min-width="190">
        <template #default="scope">
          <el-tag v-if="scope.row.creatorRewardsStatus === 'joined'" type="success" size="small">已加入</el-tag>
          <el-tag v-else-if="scope.row.creatorRewardsStatus === 'rejected'" type="danger" size="small">被拒</el-tag>
          <span v-else>-</span>
          <div v-if="scope.row.creatorRewardsUsername" class="sub-text">@{{ scope.row.creatorRewardsUsername }}</div>
        </template>
      </el-table-column>
      <el-table-column label="中视频时间" min-width="210" show-overflow-tooltip>
        <template #default="scope">
          <template v-if="scope.row.creatorRewardsStatus === 'joined'">
            加入：{{ shortTime(scope.row.creatorRewardsJoinedAt) }}
          </template>
          <template v-else-if="scope.row.creatorRewardsStatus === 'rejected'">
            被拒：{{ shortTime(scope.row.creatorRewardsRejectedAt) }}
            <div class="sub-text">可重申：{{ shortTime(scope.row.creatorRewardsRetryAt) }}</div>
          </template>
          <template v-else>-</template>
        </template>
      </el-table-column>
      <el-table-column prop="tiktokFollowers" label="粉丝" width="100"/>
      <el-table-column label="播放" width="120">
        <template #default="scope">
          {{ scope.row.tiktokViewsText || scope.row.tiktokViews || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="接码Token" width="110">
        <template #default="scope">
          <el-tag :type="scope.row.hasToken ? 'success' : 'info'" size="small">
            {{ scope.row.hasToken ? '已设置' : '未设置' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="loginStatus" label="登录状态" width="120">
        <template #default="scope">
          {{ scope.row.loginStatus || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="creatorRewardsLastCheckedAt" label="识别时间" min-width="170"/>
      <el-table-column prop="lastAgentSyncAt" label="同步时间" min-width="170"/>
    </el-table>

    <div class="pagination">
      <el-pagination
          background
          :current-page="params.num"
          :page-size="params.size"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          :total="total"
          @size-change="sizeChange"
          @current-change="numChange"
      />
    </div>
  </div>
</template>

<script setup>
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {useSettingStore} from '@/store/setting.js'
import {assetList, assetScanCreatorRewards} from '@/request/asset.js'
import {tzDayjs} from '@/utils/day.js'

defineOptions({
  name: 'email-assets'
})

const route = useRoute()
const settingStore = useSettingStore()
const domainOptions = computed(() => settingStore.domainList || [])
const loading = ref(false)
const scanLoading = ref(false)
const list = ref([])
const total = ref(0)
const params = reactive({
  domain: '',
  creatorStatus: '',
  keyword: '',
  assetOnly: true,
  configuredOnly: false,
  num: 1,
  size: 20
})

watch(() => route.query.domain, (domain) => {
  params.domain = cleanDomain(domain)
  params.num = 1
  loadData()
}, {immediate: true})

onMounted(() => {
  if (!route.query.domain) loadData()
})

function search() {
  params.num = 1
  loadData()
}

function numChange(num) {
  params.num = num
  loadData()
}

function sizeChange(size) {
  params.size = size
  params.num = 1
  loadData()
}

function loadData() {
  loading.value = true
  assetList({...params, domain: cleanDomain(params.domain)}).then(data => {
    list.value = data.list || []
    total.value = data.total || 0
  }).finally(() => {
    loading.value = false
  })
}

function scanCreatorRewards() {
  const domain = cleanDomain(params.domain)
  const scopeText = domain ? `当前域名 ${domain}` : '全部已接管域名'
  ElMessageBox.confirm(`确认扫描历史中视频邮件？范围：${scopeText}。只会识别 TikTok 中视频官方邮件，邮箱已存在不会重复创建。`, '扫描中视频邮件', {
    type: 'warning',
    confirmButtonText: '开始扫描',
    cancelButtonText: '取消'
  }).then(() => {
    scanLoading.value = true
    return assetScanCreatorRewards({domain, limit: 3000})
      .then(data => {
        ElMessage.success(`扫描完成：识别 ${data.updated || 0} 封，新增子邮箱 ${data.created || 0} 个，已加入 ${data.joined || 0} 个，被拒 ${data.rejected || 0} 个`)
        loadData()
      })
      .finally(() => {
        scanLoading.value = false
      })
  }).catch(() => {})
}

function cleanDomain(domain) {
  return String(domain || '').replace(/^@/, '').trim().toLowerCase()
}

function shortTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}
</script>

<style scoped lang="scss">
.email-assets {
  padding: 18px;
}

.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    font-size: 22px;
  }

  p {
    margin: 6px 0 0;
    color: var(--el-text-color-secondary);
  }
}

.filters {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;

  .el-select {
    width: 160px;
  }

  .el-input {
    width: 260px;
  }
}

.sub-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 3px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

@media (max-width: 900px) {
  .toolbar {
    flex-direction: column;
  }

  .filters {
    justify-content: flex-start;
  }
}
</style>
