<template>
  <el-scrollbar class="overview-scroll">
    <div class="asset-overview" v-loading="loading">
      <section class="hero">
        <div>
          <p class="eyebrow">资产概览</p>
          <h1>邮箱账号资产统计</h1>
          <p class="subtitle">这里先暴露需要处理的账号，再看整体资产盘子。能处理的中视频、异常状态、未同步资产都可以直接跳到邮箱资产列表。</p>
        </div>
        <el-button type="primary" :loading="loading" @click="load">刷新统计</el-button>
      </section>

      <section class="action-grid">
        <article
            v-for="item in actionCards"
            :key="item.title"
            class="action-card"
            :class="[item.tone, {clickable: canOpenAssets}]"
            @click="openAssetList(item.query)"
        >
          <div class="action-icon">
            <Icon :icon="item.icon" width="26" height="26" />
          </div>
          <div class="action-body">
            <span>{{ item.title }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.desc }}</small>
          </div>
          <span class="action-cue">{{ canOpenAssets ? '查看名单' : '仅显示统计' }}</span>
        </article>
      </section>

      <section class="metric-grid">
        <article
            v-for="item in cards"
            :key="item.title"
            class="metric-card"
            :class="[item.tone, {clickable: item.query && canOpenAssets}]"
            @click="openAssetList(item.query)"
        >
          <div class="metric-icon">
            <Icon :icon="item.icon" width="24" height="24" />
          </div>
          <div class="metric-body">
            <span>{{ item.title }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.desc }}</small>
            <em v-if="item.query && canOpenAssets">查看筛选</em>
          </div>
        </article>
      </section>

      <section class="ratio-grid">
        <div class="ratio-card">
          <div class="ratio-head">
            <span>TikTok 识别率</span>
            <strong>{{ summary.tiktokRate }}%</strong>
          </div>
          <el-progress :percentage="summary.tiktokRate" :stroke-width="10" />
        </div>
        <div class="ratio-card">
          <div class="ratio-head">
            <span>BitBrowser 同步率</span>
            <strong>{{ summary.bitBrowserRate }}%</strong>
          </div>
          <el-progress :percentage="summary.bitBrowserRate" :stroke-width="10" color="#13b981" />
        </div>
        <div class="ratio-card">
          <div class="ratio-head">
            <span>本地同步覆盖率</span>
            <strong>{{ summary.syncRate }}%</strong>
          </div>
          <el-progress :percentage="summary.syncRate" :stroke-width="10" color="#f59e0b" />
        </div>
      </section>

      <section class="panel-grid">
        <article class="panel domain-panel">
          <div class="panel-title">
            <div>
              <h2>按域名拆分</h2>
              <p>后续换域名时，先看这里是否正常进资产池。</p>
            </div>
          </div>
          <el-table :data="summary.domains" :empty-text="loading ? '' : '暂无域名资产'" style="width: 100%">
            <el-table-column prop="domain" label="域名" min-width="150">
              <template #default="props">
                <el-tag size="small" class="domain-tag" :class="{disabled: !canOpenAssets}" @click.stop="openDomainAssets(props.row)">@{{ props.row.domain }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="total" label="邮箱数" width="100" />
            <el-table-column prop="tiktokLinked" label="已识别 TikTok" width="130" />
            <el-table-column prop="bitBrowserLinked" label="已同步浏览器" width="130" />
            <el-table-column prop="creatorReady" label="疑似达标" width="110" />
            <el-table-column prop="creatorReadyTodo" label="待处理" width="100" />
          </el-table>
        </article>

        <article class="panel status-panel">
          <div class="panel-title">
            <div>
              <h2>状态检查</h2>
              <p>异常账号和未同步账号会优先暴露，方便你回到本地软件处理。</p>
            </div>
          </div>
          <div class="status-list">
            <div
                v-for="item in summary.statuses"
                :key="item.loginStatus"
                class="status-row"
                :class="{clickable: canOpenAssets}"
                @click="openStatusAssets(item)"
            >
              <span>{{ item.loginStatus }}</span>
              <strong>{{ formatNumber(item.total) }}</strong>
            </div>
            <el-empty v-if="!loading && summary.statuses.length === 0" description="暂无状态数据" />
          </div>
          <div class="tips">
            <div><span>中视频参考规则</span><b>粉丝 {{ formatNumber(summary.thresholds.followers) }}+ / 播放 {{ formatNumber(summary.thresholds.views) }}+</b></div>
            <div><span>最近账号同步</span><b>{{ formatTime(summary.latestAgentSyncAt) }}</b></div>
            <div><span>最近数据同步</span><b>{{ formatTime(summary.latestStatsSyncAt) }}</b></div>
          </div>
        </article>
      </section>
    </div>
  </el-scrollbar>
</template>

<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {Icon} from '@iconify/vue'
import {useUserStore} from '@/store/user.js'
import {assetSummary} from '@/request/asset.js'
import {tzDayjs} from '@/utils/day.js'

defineOptions({
  name: 'analysis'
})

const loading = ref(true)
const summary = ref(emptySummary())
const router = useRouter()
const userStore = useUserStore()
const canOpenAssets = computed(() => {
  const permKeys = userStore.user?.permKeys || []
  return permKeys.includes('*') || permKeys.includes('user:query')
})

const actionCards = computed(() => [
  {
    title: '可尝试加入中视频',
    value: formatNumber(summary.value.creatorReadyTodo),
    desc: `达标总数 ${formatNumber(summary.value.creatorReady)} 个，先看还没结论的账号`,
    icon: 'solar:cup-star-linear',
    tone: 'gold',
    query: {creatorTodo: '1'}
  },
  {
    title: '异常状态',
    value: formatNumber(summary.value.abnormalTotal),
    desc: '登录状态不是正常/在线，优先回本地处理',
    icon: 'mdi:alert-circle-outline',
    tone: 'red',
    query: {loginHealth: 'abnormal'}
  },
  {
    title: '未同步资产',
    value: formatNumber(summary.value.unsyncedTotal),
    desc: '还没有本地矩阵同步时间的账号',
    icon: 'tabler:cloud-question',
    tone: 'slate',
    query: {syncState: 'unsynced'}
  }
])

const cards = computed(() => [
  {
    title: '总邮箱资产',
    value: formatNumber(summary.value.total),
    desc: `已删除 ${formatNumber(summary.value.deletedTotal)} 个`,
    icon: 'hugeicons:mailbox-01',
    tone: 'blue',
    query: {status: 'active'}
  },
  {
    title: '已识别 TikTok',
    value: formatNumber(summary.value.tiktokLinked),
    desc: `还有 ${formatNumber(Math.max(0, summary.value.total - summary.value.tiktokLinked))} 个待识别`,
    icon: 'ri:tiktok-fill',
    tone: 'dark',
    query: {tiktokLinked: '1'}
  },
  {
    title: '已同步浏览器',
    value: formatNumber(summary.value.bitBrowserLinked),
    desc: '来自 BitBrowser / 矩阵工具同步',
    icon: 'fluent:window-dev-tools-20-regular',
    tone: 'green',
    query: {bitBrowserLinked: '1'}
  },
  {
    title: '中视频达标总数',
    value: formatNumber(summary.value.creatorReady),
    desc: `其中 ${formatNumber(summary.value.creatorReadyTodo)} 个还没结论`,
    icon: 'solar:cup-star-linear',
    tone: 'gold',
    query: {creatorReady: '1'}
  },
  {
    title: '中视频已加入',
    value: formatNumber(summary.value.creatorJoined),
    desc: '来自手动标记或 TikTok 邮件识别',
    icon: 'solar:verified-check-bold',
    tone: 'green',
    query: {creatorStatus: '已加入'}
  },
  {
    title: '中视频被拒绝',
    value: formatNumber(summary.value.creatorRejected),
    desc: '会保留再试日期和新增播放参考',
    icon: 'solar:calendar-mark-linear',
    tone: 'orange',
    query: {creatorStatus: '被拒绝'}
  },
  {
    title: '中视频已封',
    value: formatNumber(summary.value.creatorBanned),
    desc: '用于区分永久异常账号',
    icon: 'solar:shield-warning-linear',
    tone: 'red',
    query: {creatorStatus: '已封'}
  },
  {
    title: '中视频无权限',
    value: formatNumber(summary.value.creatorNoPermission),
    desc: '平台提示暂不可加入或无入口',
    icon: 'solar:lock-keyhole-linear',
    tone: 'slate',
    query: {creatorStatus: '无权限'}
  },
  {
    title: '异常状态',
    value: formatNumber(summary.value.abnormalTotal),
    desc: '登录状态不是正常/在线的账号',
    icon: 'mdi:alert-circle-outline',
    tone: 'red',
    query: {loginHealth: 'abnormal'}
  },
  {
    title: '未同步资产',
    value: formatNumber(summary.value.unsyncedTotal),
    desc: '后面由本地矩阵工具补齐',
    icon: 'tabler:cloud-question',
    tone: 'slate',
    query: {syncState: 'unsynced'}
  }
])

onMounted(load)

function load() {
  loading.value = true
  assetSummary().then(data => {
    summary.value = {...emptySummary(), ...(data || {})}
  }).finally(() => {
    loading.value = false
  })
}

function emptySummary() {
  return {
    total: 0,
    deletedTotal: 0,
    tiktokLinked: 0,
    bitBrowserLinked: 0,
    syncedTotal: 0,
    unsyncedTotal: 0,
    creatorReady: 0,
    creatorReadyTodo: 0,
    creatorJoined: 0,
    creatorRejected: 0,
    creatorBanned: 0,
    creatorNoPermission: 0,
    abnormalTotal: 0,
    tiktokRate: 0,
    bitBrowserRate: 0,
    syncRate: 0,
    latestAgentSyncAt: '',
    latestStatsSyncAt: '',
    thresholds: {followers: 10000, views: 100000},
    domains: [],
    statuses: []
  }
}

function openAssetList(query = {}) {
  if (!canOpenAssets.value) return
  router.push({name: 'asset-center', query: cleanAssetQuery({status: 'active', ...query})})
}

function openDomainAssets(row) {
  if (!row?.domain) return
  openAssetList({domain: row.domain})
}

function openStatusAssets(item) {
  const loginStatus = String(item?.loginStatus || '').trim()
  if (!loginStatus) return
  if (loginStatus === '正常' || loginStatus.toLowerCase() === 'normal') {
    openAssetList({loginHealth: 'normal'})
    return
  }
  if (loginStatus === '未同步' || loginStatus.toLowerCase() === 'unknown') {
    openAssetList({loginHealth: 'unknown'})
    return
  }
  openAssetList({loginStatus})
}

function cleanAssetQuery(query) {
  const clean = {}
  Object.entries(query || {}).forEach(([key, value]) => {
    const text = String(value ?? '').trim()
    if (!text) return
    if (key === 'status' && text === 'active') return
    clean[key] = text
  })
  return clean
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function formatTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : '暂无'
}
</script>

<style scoped lang="scss">
.overview-scroll {
  height: 100%;
}

.asset-overview {
  min-height: 100%;
  padding: 22px;
  display: grid;
  gap: 18px;
  background:
      radial-gradient(circle at top left, rgba(24, 144, 255, 0.12), transparent 30%),
      linear-gradient(180deg, var(--extra-light-fill), var(--el-bg-color));
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  padding: 24px;
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(135deg, #07223f, #0f5f8f 58%, #16a085);
  box-shadow: 0 18px 42px rgba(7, 34, 63, 0.18);

  h1 {
    margin: 4px 0 8px;
    font-size: 30px;
    letter-spacing: 0.5px;
  }

  .eyebrow {
    margin: 0;
    opacity: 0.78;
    font-size: 13px;
  }

  .subtitle {
    margin: 0;
    max-width: 760px;
    line-height: 1.7;
    opacity: 0.86;
  }
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.action-card {
  min-height: 132px;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #fff;
}

.action-body {
  display: grid;
  gap: 5px;

  span,
  small {
    color: var(--el-text-color-secondary);
  }

  strong {
    font-size: 32px;
    color: var(--el-text-color-primary);
  }
}

.action-cue {
  align-self: end;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.metric-card {
  position: relative;
  min-height: 128px;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  display: grid;
  align-content: space-between;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);

  .metric-icon {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: #fff;
  }

  .metric-body {
    display: grid;
    gap: 4px;

    span,
    small {
      color: var(--el-text-color-secondary);
    }

    strong {
      font-size: 28px;
      color: var(--el-text-color-primary);
    }

    em {
      color: var(--el-color-primary);
      font-size: 12px;
      font-style: normal;
      font-weight: 600;
    }
  }
}

.clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.clickable:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.11);
  transform: translateY(-1px);
}

.blue .metric-icon,
.blue .action-icon { background: #1890ff; }
.dark .metric-icon,
.dark .action-icon { background: #111827; }
.green .metric-icon,
.green .action-icon { background: #13b981; }
.gold .metric-icon,
.gold .action-icon { background: #f59e0b; }
.orange .metric-icon,
.orange .action-icon { background: #f97316; }
.red .metric-icon,
.red .action-icon { background: #ef4444; }
.slate .metric-icon,
.slate .action-icon { background: #64748b; }

.ratio-grid,
.panel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.ratio-card,
.panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 16px;
  background: var(--el-bg-color);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
}

.ratio-card {
  padding: 18px;
}

.ratio-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;

  strong {
    color: var(--el-color-primary);
  }
}

.panel-grid {
  grid-template-columns: 1.3fr 0.7fr;
}

.panel {
  padding: 18px;
  min-width: 0;
}

.panel-title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 6px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
  }
}

.status-list {
  display: grid;
  gap: 10px;
}

.status-row,
.tips > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--extra-light-fill);
}

.status-row strong {
  color: var(--el-color-primary);
}

.status-row.clickable:hover {
  color: var(--el-color-primary);
}

.domain-tag {
  cursor: pointer;
}

.domain-tag.disabled {
  cursor: default;
}

.tips {
  display: grid;
  gap: 10px;
  margin-top: 14px;

  span {
    color: var(--el-text-color-secondary);
  }

  b {
    font-weight: 600;
  }
}

@media (max-width: 1440px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .hero,
  .action-grid,
  .ratio-grid,
  .panel-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    align-items: stretch;
    flex-direction: column;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .asset-overview {
    padding: 14px;
  }

  .action-card {
    grid-template-columns: auto 1fr;
  }

  .action-cue {
    grid-column: 2;
    align-self: start;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
