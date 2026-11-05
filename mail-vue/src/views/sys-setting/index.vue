<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading/>
    </div>
    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body">
        <div class="ss-wrap">
          <nav class="ss-nav">
            <div class="ss-nav-title">系统设置</div>
            <a v-for="item in ssTabs" :key="item.key" :class="{on: ssTab === item.key}" @click="ssTab = item.key">
              <Icon :icon="item.icon" width="17" height="17"/>
              <span>{{ item.label }}</span>
            </a>
          </nav>
          <div class="ss-body">

          <div class="ss-card" v-show="ssTab === 'account'">
            <div class="ss-title">账号</div>
            <div class="ss-row">
              <div class="ss-text"><b>修改登录密码</b><span>登录用 admin + 这个密码</span></div>
              <el-button size="small" type="primary" @click="pwdDialogShow = true">修改</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>网站名称</b><span>左上角和浏览器标签显示的名字：{{ setting.title }}</span></div>
              <el-button size="small" @click="editTitleShow = true">修改</el-button>
            </div>
          </div>

          <div class="ss-card" v-show="ssTab === 'receive'">
            <div class="ss-title">收信</div>
            <div class="ss-row">
              <div class="ss-text"><b>接收邮件</b><span>关掉后所有域名都收不到信</span></div>
              <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.receive"/>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>收信域名</b><span>添加新域名，一键配置 Cloudflare 收信</span></div>
              <el-button size="small" type="primary" @click="openMailDomain('domains')">管理</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>Cloudflare 令牌</b><span>一键添加收信域名要用到，保存后部署也不会丢</span></div>
              <el-button size="small" @click="openMailDomain('token')">设置</el-button>
            </div>

            <div class="ss-sub">收信分类（重要 → 收件箱，推广 → 垃圾邮件，其余 → 其他通知）</div>
            <div class="ss-row">
              <div class="ss-text"><b>开启分类 / 生效域名</b><span>{{ inboxRules.enabled ? '已开启' : '已关闭' }}：只管填写的域名，其他域名照常进收件箱</span></div>
              <el-button size="small" type="primary" @click="openInboxRules('scope')">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>重要邮件关键词</b><span>主题或正文包含这些词 → 收件箱（验证码、开通、登录、申诉…）</span></div>
              <el-button size="small" @click="openInboxRules('important')">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>推广邮件关键词</b><span>主题包含这些词 → 垃圾邮件</span></div>
              <el-button size="small" @click="openInboxRules('marketing')">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>永远进收件箱的发件人</b><span>例如 paypal.com、apple.com，含子域名</span></div>
              <el-button size="small" @click="openInboxRules('from')">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>按规则整理旧邮件</b><span>把最近 30 天收到的邮件按现在的规则重新分一遍</span></div>
              <el-button size="small" :loading="inboxApplyLoading" @click="applyInboxRules">整理</el-button>
            </div>

            <div class="ss-sub">其他</div>
            <div class="ss-row">
              <div class="ss-text"><b>垃圾邮件黑名单</b><span>这些发件人 / 主题 / 内容直接进垃圾邮箱</span></div>
              <el-button size="small" @click="openBlackListForm">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>自动清理旧邮件</b><span>{{ cleanSummary }}</span></div>
              <el-button size="small" @click="openClean">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>收件箱自动刷新</b><span>多久自动检查一次新邮件</span></div>
              <el-select @change="change" style="width: 90px" v-model="setting.autoRefresh">
                <el-option v-for="item in authRefreshOptions" :key="item.value" :label="item.label" :value="item.value"/>
              </el-select>
            </div>
          </div>

          <div class="ss-card" v-show="ssTab === 'send'">
            <div class="ss-title">发信</div>
            <div class="ss-row">
              <div class="ss-text"><b>允许发信</b><span>关掉后网站里不能写信发送</span></div>
              <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.send"/>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>Resend 密钥</b><span>{{ sendInfo.hasKey ? '已保存，所有发信域名共用' : '还没保存' }}</span></div>
              <el-button size="small" @click="openSendDomain('key')">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>发信域名</b><span>添加、验证用来发信的域名</span></div>
              <el-button size="small" type="primary" @click="openSendDomain('domains')">管理</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>发件地址</b><span>写信时只能选这些地址发出</span></div>
              <el-button size="small" @click="openSendDomain('senders')">设置</el-button>
            </div>
          </div>

          <div class="ss-card" v-show="ssTab === 'notify'">
            <div class="ss-title">通知 / 转发</div>
            <div class="ss-row">
              <div class="ss-text"><b>推送到 Telegram</b><span>{{ setting.tgBotStatus === 0 ? '已开启' : '未开启' }}：新邮件发到 TG 机器人</span></div>
              <el-button size="small" @click="openTgSetting">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>转发到其他邮箱</b><span>{{ setting.forwardStatus === 0 ? '已开启' : '未开启' }}：新邮件再转发一份到别的邮箱</span></div>
              <el-button size="small" @click="openThirdEmailSetting">设置</el-button>
            </div>
            <div class="ss-row">
              <div class="ss-text"><b>推送 / 转发范围</b><span>{{ setting.ruleType === 0 ? '全部邮箱' : '只推送指定邮箱' }}</span></div>
              <el-button size="small" @click="openForwardRules">设置</el-button>
            </div>
          </div>

          <div class="ss-card" v-show="ssTab === 'advanced'">
            <div class="ss-title">高级（平时不用动）</div>
              <div class="ss-row">
                <div class="ss-text"><b>开放注册</b><span>允许陌生人在登录页自己注册账号（自用建议关）</span></div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.register"/>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>注册码</b><span>注册时是否要填邀请码</span></div>
                <el-select @change="change" style="width: 90px" v-model="setting.regKey">
                  <el-option v-for="item in regKeyOptions" :key="item.value" :label="item.label" :value="item.value"/>
                </el-select>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>普通用户可添加邮箱</b><span>非管理员能否自己新建邮箱</span></div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.addEmail"/>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>一个账号多个邮箱</b><span>普通用户能否拥有多个邮箱</span></div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.manyEmail"/>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>邮箱名长度限制</b><span>新建邮箱时用户名的规则</span></div>
                <el-button size="small" @click="openEmailPrefix">设置</el-button>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>无收件人也接收</b><span>发到不存在的邮箱也收下（批量接码需要开着）</span></div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.noRecipient"/>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>AI 识别验证码</b><span>用 Cloudflare AI 从邮件里认验证码（一般不用）</span></div>
                <el-switch @change="changeField('aiCode', $event)" :before-change="beforeChange" :active-value="0" :inactive-value="1" v-model="setting.aiCode"/>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>登录页背景</b><span>换一张登录页背景图</span></div>
                <div>
                  <el-button size="small" @click="openSetBackground">更换</el-button>
                  <el-button size="small" @click="delBackground">删除</el-button>
                </div>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>登录框透明度</b><span>0 = 全透明，1 = 不透明</span></div>
                <el-input-number size="small" v-model="loginOpacity" @change="opacityChange" :precision="2" :step="0.05" :max="1" :min="0"/>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>附件存储</b><span>当前：{{ setting.storageType }}</span></div>
                <div>
                  <el-button size="small" @click="r2DomainShow = true">访问域名</el-button>
                  <el-button size="small" @click="addS3Show = true">S3</el-button>
                </div>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>人机验证</b><span>注册 / 添加邮箱时的 Cloudflare Turnstile 验证</span></div>
                <el-button size="small" @click="turnstileShow = true">设置</el-button>
              </div>
              <div class="ss-row">
                <div class="ss-text"><b>登录后弹窗公告</b><span>{{ setting.notice === 0 ? '已开启' : '未开启' }}</span></div>
                <el-button size="small" @click="openNoticePopupSetting">设置</el-button>
              </div>
          </div>
          </div>
        </div>
      </div>

      <!-- Dialogs remain the same -->
      <el-dialog v-model="editTitleShow" :title="$t('changeTitle')" width="340" @closed="editTitle = setting.title">
        <form>
          <el-input type="text" :placeholder="$t('websiteTitle')" v-model="editTitle"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTitle">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="resendTokenFormShow" :title="$t('resendToken')" width="340" @closed="cleanResendTokenForm">
        <form>
          <el-select style="margin-bottom: 15px" v-model="resendTokenForm.domain" placeholder="Select">
            <el-option
                v-for="item in settingStore.domainList"
                :key="item"
                :label="item"
                :value="item"
            />
          </el-select>
          <el-input type="text" :placeholder="$t('addResendTokenDesc')" v-model="resendTokenForm.token"/>
          <el-button type="primary" :loading="settingLoading" @click="saveResendToken">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="r2DomainShow" :title="$t('addOsDomain')" width="340"
                 @closed="r2DomainInput = setting.r2Domain">
        <form>
          <el-input type="text" :placeholder="$t('domainDesc')" v-model="r2DomainInput"/>
          <el-button type="primary" :loading="settingLoading" @click="saveR2domain">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="turnstileShow" :title="$t('addTurnstileSecret')" width="340"
                 @closed="turnstileForm.secretKey = '';turnstileForm.siteKey = ''">
        <form>
          <el-input type="text" placeholder="Site Key" v-model="turnstileForm.siteKey"/>
          <el-input type="text" style="margin-top: 15px" placeholder="Secret Key" v-model="turnstileForm.secretKey"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTurnstileKey">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog
          v-model="showSetBackground"
          class="cut-dialog"
          @closed="closedSetBackground"
      >
        <template #header>
          <span style="font-size: 18px">
            {{ $t('backgroundTitle') }}
            <el-tooltip>
              <template #content>
                <span>{{ $t('backgroundWarning') }}</span>
              </template>
              <Icon class="title-icon  warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </span>
        </template>
        <el-input :placeholder="$t('backgroundUrlDesc')" v-model="backgroundUrl" v-if="!localUpShow"
                  class="background-url"/>
        <el-image
            v-if="localUpShow"
            :preview-src-list="[backgroundImage]"
            show-progress
            class="cropper"
            fit="cover"
            :src="backgroundImage"
        ></el-image>
        <div class="cut-button">
          <el-button type="primary" link @click="openCut" v-if="!localUpShow">
            {{ $t('localUpload') }}
          </el-button>
          <el-button type="primary" link @click="localUpShow = false" v-if="localUpShow">
            {{ $t('imageLink') }}
          </el-button>
          <el-button type="primary" :loading="settingLoading" @click="saveBackground">{{ $t('save') }}</el-button>
        </div>
      </el-dialog>
      <el-dialog
          v-model="tgSettingShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('tgBot') }}</span>
            <el-tooltip effect="dark" :content="$t('tgBotDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input :placeholder="setting.tgBotToken || $t('tgBotToken')" v-model="tgBotToken"></el-input>
          <el-input-tag tag-type="warning" :placeholder="$t('toBotTokenDesc')" v-model="tgChatId"
                        @add-tag="addChatTag"></el-input-tag>
          <el-input tag-type="warning" :placeholder="$t('customDomainDesc')" v-model="customDomain" ></el-input>
          <div class="tg-msg-label">
            <span>{{t('from')}}</span>
            <el-select  v-model="tgMsgFrom" >
              <el-option
                  v-for="item in tgMsgFromOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('recipient')}}</span>
            <el-select  v-model="tgMsgTo" >
              <el-option
                  v-for="item in tgMsgToOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('emailText')}}</span>
            <el-select  v-model="tgMsgText" >
              <el-option
                  v-for="item in tgMsgTextOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="tgBotStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="tgBotSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="thirdEmailShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('otherEmail') }}</span>
            <el-tooltip effect="dark" :content="$t('otherEmailDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag tag-type="warning" :placeholder="$t('otherEmailInputDesc')" v-model="forwardEmail"
                        @add-tag="emailAddTag"></el-input-tag>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="forwardStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="forwardEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="forwardRulesShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('forwardingRules') }}</span>
            <el-tooltip effect="dark" :content="$t('forwardingRulesDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag :placeholder="$t('ruleEmailsInputDesc')" tag-type="success" v-model="ruleEmail"
                        @add-tag="ruleEmailAddTag"/>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-radio-group v-model="ruleType">
              <el-radio :value="0">{{ $t('forwardAll') }}</el-radio>
              <el-radio :value="1">{{ $t('rules') }}</el-radio>
            </el-radio-group>
            <el-button :loading="settingLoading" type="primary" @click="ruleEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="pwdDialogShow" title="修改登录密码" width="340">
        <form>
          <el-input type="password" placeholder="新密码（至少 6 位）" v-model="pwdForm.password" autocomplete="new-password" style="margin-bottom: 12px"/>
          <el-input type="password" placeholder="再输一次" v-model="pwdForm.again" autocomplete="new-password" style="margin-bottom: 12px"/>
          <el-button type="primary" style="width: 100%" :loading="pwdLoading" @click="savePwd">保存</el-button>
        </form>
      </el-dialog>

      <el-dialog v-model="cleanShow" title="自动清理旧邮件" width="460">
        <div class="send-domain" v-loading="inboxRulesLoading">
          <p class="sd-hint" style="margin-top: 0">超过天数的邮件会被彻底删除（所有域名）。加了星标的邮件永远不删。填 0 = 不删。每天凌晨自动执行一次，删除后不能恢复。</p>
          <div class="sd-row" style="gap: 10px; margin-top: 12px">
            <span style="width: 110px">垃圾邮件超过</span>
            <el-input-number v-model="inboxRules.cleanSpamDays" :min="0" :max="3650" size="small" style="width: 120px"/>
            <span>天</span>
          </div>
          <div class="sd-row" style="gap: 10px; margin-top: 12px">
            <span style="width: 110px">收件箱超过</span>
            <el-input-number v-model="inboxRules.cleanInboxDays" :min="0" :max="3650" size="small" style="width: 120px"/>
            <span>天</span>
          </div>
        </div>
        <template #footer>
          <el-button :loading="inboxCleanLoading" @click="cleanNow">现在就清理</el-button>
          <el-button type="primary" :loading="inboxRulesLoading" @click="saveInboxRules">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="inboxRulesShow" :title="ruleTitles[ruleSection]" width="560">
        <div class="send-domain" v-loading="inboxRulesLoading">
          <el-form label-position="top">
            <template v-if="ruleSection === 'scope'">
              <div class="sd-row" style="margin-bottom: 12px">
                <el-switch v-model="inboxRules.enabled" active-text="开启收信分类（和原 VPS 邮局同一套规则）"/>
              </div>
              <el-form-item label="只对这些收件域名生效（一行一个；留空 = 所有域名）">
                <el-input v-model="inboxRules.domainsText" type="textarea" :rows="4"/>
              </el-form-item>
              <p class="sd-hint">不在列表里的域名不分类，邮件照常进收件箱。</p>
            </template>
            <template v-else-if="ruleSection === 'important'">
              <el-form-item label="主题包含（一行一个，不分大小写）">
                <el-input v-model="inboxRules.subjectText" type="textarea" :rows="12"/>
              </el-form-item>
              <el-form-item label="正文包含">
                <el-input v-model="inboxRules.bodyText" type="textarea" :rows="4"/>
              </el-form-item>
              <p class="sd-hint">命中任意一条就进收件箱。看到漏判的重要邮件，把它的完整标题加进来。</p>
            </template>
            <template v-else-if="ruleSection === 'marketing'">
              <el-form-item label="主题包含（一行一个，不分大小写）">
                <el-input v-model="inboxRules.marketingText" type="textarea" :rows="10"/>
              </el-form-item>
              <p class="sd-hint">命中的进垃圾邮件；没命中、也不是重要邮件的进「其他通知」。</p>
            </template>
            <template v-else-if="ruleSection === 'from'">
              <el-form-item label="域名或邮箱（一行一个，含子域名）">
                <el-input v-model="inboxRules.fromText" type="textarea" :rows="8"/>
              </el-form-item>
              <p class="sd-hint">这些发件方的邮件不管内容是什么，都进收件箱。</p>
            </template>
          </el-form>
        </div>
        <template #footer>
          <el-button @click="resetInboxRules">恢复默认</el-button>
          <el-button type="primary" :loading="inboxRulesLoading" @click="saveInboxRules">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="mailDomainShow" :title="mailSection === 'token' ? 'Cloudflare 令牌' : '收信域名'" :width="mailSection === 'token' ? 520 : 720">
        <div class="send-domain" v-if="mailSection === 'token'">
          <p class="sd-hint" style="margin-top: 0">{{ mailDomainInfo.hasToken ? '令牌已保存。要换新的，粘贴后点保存。' : '还没有令牌。在 Cloudflare 创建一个 API 令牌（权限：Zone 读取、DNS 编辑、Email Routing 规则编辑、Zone 设置编辑；范围：所有域名），粘贴到这里。' }}</p>
          <div class="sd-row">
            <el-input v-model="mailTokenInput" type="password" show-password :placeholder="mailDomainInfo.hasToken ? 'Cloudflare 令牌已保存（要换就粘贴新的）' : '粘贴 Cloudflare API 令牌（Zone 读取、DNS 编辑、Email Routing 规则编辑、Zone 设置编辑）'"/>
            <el-button type="primary" :loading="mailTokenLoading" @click="saveMailToken">保存令牌</el-button>
          </div>
        </div>
        <div class="send-domain" v-else>
          <el-alert v-if="!mailDomainInfo.hasToken" type="warning" :closable="false" title="还没有保存 Cloudflare 令牌，先到「Cloudflare 令牌」那一项保存，才能一键添加。" style="margin-bottom: 10px"/>
          <div class="sd-row">
            <el-input v-model="mailDomainInput" placeholder="要收信的域名，例如 flyvg.com（需已托管在这个 Cloudflare 账号）" @keyup.enter="addMailDomain(false)"/>
            <el-button type="primary" :loading="mailDomainLoading" :disabled="!mailDomainInfo.hasToken" @click="addMailDomain(false)">一键添加</el-button>
            <el-button :loading="mailDomainLoading" @click="loadMailDomains">刷新</el-button>
          </div>
          <p class="sd-hint">一键添加会自动：开启 Cloudflare 收信、写入 MX/SPF、把该域名全部邮件转进本系统、加入域名列表。添加后刷新页面即可在各处选择这个域名。</p>
          <div v-if="mailDomainSteps.length" class="sd-hint" style="color: var(--el-color-success)">{{ mailDomainSteps.join(' → ') }}</div>
          <el-table :data="mailDomainInfo.list" size="small" empty-text="暂无">
            <el-table-column prop="domain" label="域名" min-width="140"/>
            <el-table-column label="收信" width="90">
              <template #default="{row}">
                <el-tag size="small" :type="row.routing === 'enabled' ? 'success' : (row.zone ? 'warning' : 'info')">
                  {{ row.routing === 'enabled' ? '已开启' : (row.zone ? '未开启' : (mailDomainInfo.hasToken ? '不在账号' : '—')) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="MX" min-width="170" :show-overflow-tooltip="true">
              <template #default="{row}">{{ (row.mx || []).join(', ') || '—' }}</template>
            </el-table-column>
            <el-table-column label="全收转到" min-width="130" :show-overflow-tooltip="true">
              <template #default="{row}">{{ row.catchAll || '—' }}</template>
            </el-table-column>
            <el-table-column label="" width="110">
              <template #default="{row}">
                <span v-if="row.fixed" class="sd-hint" style="margin: 0">部署配置</span>
                <el-button v-else size="small" link type="danger" @click="removeMailDomain(row)">从列表移除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <p v-if="mailDomainInfo.list.some(x => x.error)" class="sd-hint" style="color: var(--el-color-danger)">
            {{ mailDomainInfo.list.find(x => x.error).error }}
          </p>
        </div>
      </el-dialog>
      <el-dialog v-model="sendDomainShow" :title="{key: 'Resend 密钥', domains: '发信域名', senders: '发件地址'}[sendSection]" :width="sendSection === 'domains' ? 680 : 520">
        <div class="send-domain">
          <div class="sd-row" v-if="sendSection === 'key'">
            <el-input v-model="sendKeyInput" type="password" show-password
                      :placeholder="sendInfo.hasKey ? '已保存通用密钥，填写新的可替换' : '粘贴 Resend 密钥（re_ 开头），所有域名共用'"/>
            <el-button type="primary" :loading="sendLoading" @click="saveSendKey">保存密钥</el-button>
          </div>
          <template v-if="sendSection === 'domains'">
          <el-alert v-if="!sendInfo.hasKey" type="warning" :closable="false" title="还没有保存 Resend 密钥，先到「Resend 密钥」那一项保存。" style="margin-bottom: 10px"/>
          <div class="sd-row">
            <el-input v-model="sendDomainInput" placeholder="要发信的域名，例如 ntmcn.com" @keyup.enter="addSendDomain"/>
            <el-button type="primary" :loading="sendLoading" :disabled="!sendInfo.hasKey" @click="addSendDomain">添加域名</el-button>
            <el-button :loading="sendLoading" @click="loadSendDomains">刷新</el-button>
          </div>
          <p class="sd-hint">{{ sendInfo.autoDns ? '添加后会自动在 Cloudflare 写入 DNS 记录，几分钟后点「验证」。' : '添加后去 Resend 网站该域名页面点「Auto configure」，或按「记录」里的内容在 Cloudflare 手动添加，然后回来点「验证」。' }}</p>
          <el-table :data="sendInfo.list" size="small" empty-text="还没有发信域名">
            <el-table-column prop="name" label="域名" min-width="150"/>
            <el-table-column label="状态" width="110">
              <template #default="{row}">
                <el-tag size="small" :type="row.status === 'verified' ? 'success' : (row.status === 'failed' ? 'danger' : 'warning')">
                  {{ sendStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="230">
              <template #default="{row}">
                <el-button size="small" link type="primary" @click="verifySendDomain(row)">验证</el-button>
                <el-button size="small" link type="primary" @click="showSendRecords(row)">记录</el-button>
                <el-button v-if="sendInfo.autoDns && row.status !== 'verified'" size="small" link type="primary" @click="applySendDns(row)">写入 DNS</el-button>
              </template>
            </el-table-column>
          </el-table>
          </template>
          <div class="sd-senders" v-if="sendSection === 'senders'" style="margin-top: 0">
            <el-input v-model="senderText" type="textarea" :rows="3"
                      placeholder="每行一个，例如 support@ntmcn.com。没有的邮箱会自动创建；留空则显示全部邮箱"/>
            <div class="sd-row" style="margin-top: 8px">
              <el-button type="primary" :loading="sendLoading" @click="saveSenders">保存发件地址</el-button>
              <span class="sd-hint" style="margin: 0; align-self: center">发件地址的域名需要在上面列表里「已验证」才能发到外部邮箱</span>
            </div>
          </div>
          <div v-if="sendSection === 'domains' && sendRecords.name" class="sd-records">
            <div class="sd-title">{{ sendRecords.name }} 需要的 DNS 记录</div>
            <el-table :data="sendRecords.records" size="small">
              <el-table-column prop="type" label="类型" width="70"/>
              <el-table-column prop="name" label="名称" width="150" :show-overflow-tooltip="true"/>
              <el-table-column prop="value" label="内容" min-width="200" :show-overflow-tooltip="true"/>
              <el-table-column label="状态" width="90">
                <template #default="{row}">{{ sendStatusText(row.status) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-dialog>
      <el-dialog class="resend-table" v-model="showResendList" :title="$t('resendTokenList')">
        <el-table :data="resendList">
          <el-table-column :min-width="emailColumnWidth" property="key" :label="$t('domain')"
                           :show-overflow-tooltip="true"/>
          <el-table-column :width="tokenColumnWidth" property="value" label="Token" fixed="right"
                           :show-overflow-tooltip="true"/>
        </el-table>
      </el-dialog>
      <el-dialog v-model="regVerifyCountShow" :title="$t('rulesVerifyTitle',{count: regVerifyCount})"
                 @closed="regVerifyCount = setting.regVerifyCount">
        <form>
          <el-input-number type="text" v-model="regVerifyCount" :min="1">
          </el-input-number>
          <el-button type="primary" :loading="settingLoading" @click="saveRegVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="addVerifyCountShow" :title="$t('rulesVerifyTitle',{count: addVerifyCount})"
                 @closed="addVerifyCount = setting.addVerifyCount">
        <form>
          <el-input-number type="text" v-model="addVerifyCount" :min="1"/>
          <el-button type="primary" :loading="settingLoading" @click="saveAddVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog top="5vh" v-model="noticePopupShow" :title="$t('noticePopup')" class="notice-popup"
                 @closed="resetNoticeForm">
        <form>
          <el-input v-model="noticeForm.noticeTitle" :placeholder="t('titleDesc')"/>
          <div class="notice-line-item">
            <el-select v-model="noticeForm.noticeType">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('icon') }}</span>
              </template>
              <el-option key="none" label="None" value="none"/>
              <el-option key="primary" label="Primary" value="primary"/>
              <el-option key="success" label="Success" value="success"/>
              <el-option key="warning" label="Warning" value="warning"/>
              <el-option key="info" label="Info" value="info"/>
            </el-select>
            <el-select v-model="noticeForm.noticePosition">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('position') }}</span>
              </template>
              <el-option key="top-left" :label="t('topLeft')" value="top-left"/>
              <el-option key="top-right" :label="t('topRight')" value="top-right"/>
              <el-option key="bottom-left" :label="t('bottomLeft')" value="bottom-left"/>
              <el-option key="bottom-right" :label="t('bottomRight')" value="bottom-right"/>
            </el-select>
            <el-input-number v-model="noticeForm.noticeWidth">
              <template #prefix>
                {{ $t('width') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeOffset">
              <template #prefix>
                {{ $t('offset') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeDuration">
              <template #prefix>
                {{ $t('duration') }}
              </template>
              <template #suffix>
                ms
              </template>
            </el-input-number>
          </div>
          <div class="notice-popup-item">
            <el-input
                v-model="noticeForm.noticeContent"
                :autosize="{ minRows: 15, maxRows: 25 }"
                type="textarea"
                :placeholder="t('noticeContentDesc')"
            />
          </div>
        </form>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="noticeForm.notice" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <div>
              <el-button @click="previewNoticePopup">
                {{ $t('preview') }}
              </el-button>
              <el-button :loading="settingLoading" type="primary" @click="saveNoticePopup">
                {{ $t('save') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="addS3Show" :title="t('s3Configuration')" width="340" @closed="resetAddS3Form">
        <form>
          <el-input class="dialog-input" type="text" placeholder="Bucket" v-model="s3.bucket"/>
          <el-input class="dialog-input" type="text" placeholder="Endpoint" v-model="s3.endpoint"/>
          <el-input class="dialog-input" type="text" placeholder="Region" v-model="s3.region"/>
          <el-input class="dialog-input" type="text" :placeholder="setting.s3AccessKey || 'Access Key'"
                    v-model="s3.s3AccessKey"/>
          <el-input style="margin-bottom: 10px" type="text" :placeholder="setting.s3SecretKey || 'Secret Key'" v-model="s3.s3SecretKey"/>
          <div class="force-path-style">
            <div class="force-path-style-left">
              <span>ForcePathStyle</span>
              <el-tooltip effect="dark" :content="$t('forcePathStyleDesc')">
                <Icon class="warning" icon="fe:warning" width="18" height="18"/>
              </el-tooltip>
            </div>
            <el-switch :before-change="beforeChange" :active-value="0" :inactive-value="1"
                       v-model="s3.forcePathStyle"/>
          </div>
          <div class="s3-button">
            <el-button :loading="clearS3Loading" @click="clearS3">{{ t('clear') }}</el-button>
            <el-button type="primary" :loading="settingLoading && !clearS3Loading" @click="saveS3">{{ t('save') }}</el-button>
          </div>
        </form>
      </el-dialog>
      <el-dialog v-model="emailPrefixShow" :title="t('emailPrefix')"  @closed="resetEmailPrefix"  >
        <div class="email-prefix">
          <div>{{ t('atLeast') }}</div>
          <el-input-number v-model="minEmailPrefix" :min="1" :max="20" style="width: 150px" >
            <template #suffix>
              <span>{{ t('character') }}</span>
            </template>
          </el-input-number>
        </div>
        <div class="prefix-filter">
          <div style="margin-bottom: 10px;">{{ t('mustNotContain') }}</div>
          <el-input-tag style="margin-bottom: 10px;" v-model="emailPrefixFilter"  />
        </div>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveEmailPrefix">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="blackFormShow" class="forward-dialog" @closed="resetBlackList">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('blackList') }}</span>
            <el-tooltip effect="dark" :content="$t('blackListDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('blackFromDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackFrom" @add-tag="banEmailAddTag"  />
          </el-form-item>
          <el-form-item :label="t('blackSubjectDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackSubject"/>
          </el-form-item>
          <el-form-item :label="t('blackContentDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackContent"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveBlackList">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="aiCodeFilterShow" class="forward-dialog" @closed="resetAiCodeFilter">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('codeRecognitionRules') }}</span>
            <el-tooltip effect="dark" :content="$t('codeRecognitionRulesDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('senderRules')" label-position="top">
            <el-input-tag v-model="aiCodeFilter" @add-tag="aiCodeFilterAddTag"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveAiCodeFilter">{{ $t('save') }}</el-button>
      </el-dialog>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {computed, defineOptions, nextTick, reactive, ref} from "vue";
import {deleteBackground, setBackground, setBlackList, settingQuery, settingSet} from "@/request/setting.js";
import {resendDomainAdd, resendDomainApplyDns, resendDomainGet, resendDomainList, resendDomainVerify, resendSaveKey, sendSenderList, sendSenderSave, mailDomainList, mailDomainAdd, mailDomainRemove, inboxRulesGet, inboxRulesSave, inboxRulesApply, mailDomainSaveToken, inboxRulesClean} from "@/request/resend-domain.js";
import {useSettingStore} from "@/store/setting.js";
import {resetPassword} from "@/request/my.js";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useAccountStore} from "@/store/account.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {storeToRefs} from "pinia";
import {debounce} from 'lodash-es'
import {isDomain, isEmail} from "@/utils/verify-utils.js";
import loading from "@/components/loading/index.vue";
import {getTextWidth} from "@/utils/text.js";
import {fileToBase64} from "@/utils/file-utils.js"
import {useI18n} from 'vue-i18n';
import axios from "axios";
import router from "@/router/index.js";

defineOptions({
  name: 'sys-setting'
})

const currentVersion = 'v3.0.0'
const hasUpdate = ref(false)
let getUpdateErrorCount = 1;
const {t, locale} = useI18n();
const firstLoading = ref(true)
const settingReady = ref(false)
const backgroundImage = ref('')
const localUpShow = ref(false)
const accountStore = useAccountStore();
const userStore = useUserStore();
const editTitleShow = ref(false)
const resendTokenFormShow = ref(false)
const blackFormShow = ref(false)
const aiCodeFilterShow = ref(false)
const r2DomainShow = ref(false)
const turnstileShow = ref(false)
const tgSettingShow = ref(false)
const noticePopupShow = ref(false)
const thirdEmailShow = ref(false)
const forwardRulesShow = ref(false)
const emailPrefixShow = ref(false)
const showResendList = ref(false)
const settingStore = useSettingStore();
const uiStore = useUiStore();
const {settings: setting} = storeToRefs(settingStore);
const editTitle = ref('')
const settingLoading = ref(false)
const clearS3Loading = ref(false)
const r2DomainInput = ref('')
const loginOpacity = ref(0)
const minEmailPrefix = ref(0)
const emailPrefixFilter = ref([])
const backgroundUrl = ref('')
let backgroundFile = {}
const showSetBackground = ref(false)
let regVerifyCount = ref(1)
let addVerifyCount = ref(1)
let backup = '{}'
const addS3Show = ref(false)
const addVerifyCountShow = ref(false)
const regVerifyCountShow = ref(false)
const resendTokenForm = reactive({
  domain: '',
  token: '',
})
const turnstileForm = reactive({
  siteKey: '',
  secretKey: ''
})

const s3 = reactive({
  bucket: '',
  endpoint: '',
  region: '',
  s3AccessKey: '',
  s3SecretKey: '',
  forcePathStyle: 1
})

const noticeForm = reactive({
  noticeTitle: '',
  noticeContent: '',
  noticeType: '',
  noticeDuration: '',
  noticePosition: '',
  noticeOffset: 0,
  notice: 0,
  noticeWidth: 0
})

const regKeyOptions = computed(() => [
  {label: t('enable'), value: 0},
  {label: t('disable'), value: 1},
  {label: t('optional'), value: 2},
])

const blackListForm = ref({
  blackSubject: [],
  blackContent: [],
  blackFrom: []
})
const aiCodeFilter = ref([])

const authRefreshOptions = computed(() => [
  {label: t('disable'), value: 0},
  {label: '3s', value: 3},
  {label: '5s', value: 5},
  {label: '10s', value: 10},
  {label: '15s', value: 15},
  {label: '20s', value: 20},
])

const tgChatId = ref([])
const customDomain = ref('')
const tgBotStatus = ref(0)
const tgBotToken = ref('')
const forwardEmail = ref([])
const forwardStatus = ref(0)
const emailColumnWidth = ref(0)
const tokenColumnWidth = ref(0)
const ruleType = ref(0)
const ruleEmail = ref([])
const tgMsgFrom = ref('')
const tgMsgTo = ref('')
const tgMsgText = ref('')

const tgMsgFromOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}, {label: t('onlyName'), value:'only-name'}]
const tgMsgToOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgTextOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgLabelWidth = computed(() => locale.value === 'en' ? '120px' : '100px');
const syncOrigin = computed(() => window.location.origin)
const syncAccountUrl = computed(() => `${syncOrigin.value}/api/sync_account`)
const localAgentBaseUrl = computed(() => `${syncOrigin.value}/api/local-agent`)

getSettings()
getUpdate()

function openRoute(name) {
  router.push({name})
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const input = document.createElement('textarea')
      input.value = text
      input.setAttribute('readonly', 'readonly')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    ElMessage({
      message: '已复制',
      type: 'success',
      plain: true
    })
  } catch (e) {
    ElMessage({
      message: '复制失败，请手动复制',
      type: 'error',
      plain: true
    })
  }
}

function getSettings() {
  settingReady.value = false
  settingQuery().then(settingData => {
    setting.value = settingData
    settingStore.domainList = settingData.domainList;
    resendTokenForm.domain = setting.value.domainList[0]
    loginOpacity.value = setting.value.loginOpacity
    minEmailPrefix.value = setting.value.minEmailPrefix
    firstLoading.value = false
    backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
    editTitle.value = setting.value.title
    r2DomainInput.value = setting.value.r2Domain
    addVerifyCount.value = setting.value.addVerifyCount
    regVerifyCount.value = setting.value.regVerifyCount
    resetNoticeForm()
    resetAddS3Form()
    resetEmailPrefix()
    resetBlackList()
    resetAiCodeFilter()
    nextTick(() => {
      settingReady.value = true
    })
  })
}


function openNoticePopup() {
  uiStore.showNotice()
}

function openAddVerifyCount() {
  if (settingLoading.value) return
  addVerifyCountShow.value = true
}

function openRegVerifyCount() {
  if (settingLoading.value) return
  regVerifyCountShow.value = true
}

function resetAddS3Form() {
  s3.bucket = setting.value.bucket
  s3.endpoint = setting.value.endpoint
  s3.region = setting.value.region
  s3.s3AccessKey = ''
  s3.s3SecretKey = ''
  s3.forcePathStyle = setting.value.forcePathStyle
}

const resendList = computed(() => {

  let list = Object.keys(setting.value.resendTokens).map(key => {
    return {
      key: key,
      value: setting.value.resendTokens[key]
    };
  })

  if (list.length > 0) {

    const key = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'key')).key;
    emailColumnWidth.value = getTextWidth(key) + 30;

    const value = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'value')).value;
    tokenColumnWidth.value = getTextWidth(value) + 30;

  }

  return list;
});

function getUpdate() {
  if (getUpdateErrorCount > 5 || !getUpdateErrorCount) return
  axios.get('https://api.github.com/repos/maillab/cloud-mail/releases/latest').then(({data}) => {
    hasUpdate.value = data.name !== currentVersion
    getUpdateErrorCount = 0
  }).catch(e => {
    getUpdateErrorCount++
    setTimeout(() => {
      getUpdate()
    }, 2000)
    console.error('检查更新失败：', e)
  })
}

function saveAddVerifyCount() {
  if (!addVerifyCount.value) {
    addVerifyCount.value = 1
  }
  editSetting({addVerifyCount: addVerifyCount.value})
}

function saveRegVerifyCount() {
  if (!regVerifyCount.value) {
    regVerifyCount.value = 1
  }
  editSetting({regVerifyCount: regVerifyCount.value})
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};


function closedSetBackground() {
  backgroundImage.value = ''
  localUpShow.value = false
  backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
}

function openTgSetting() {
  tgBotStatus.value = setting.value.tgBotStatus
  tgBotToken.value = ''
  customDomain.value = setting.value.customDomain
  tgMsgFrom.value = setting.value.tgMsgFrom
  tgMsgText.value = setting.value.tgMsgText
  tgMsgTo.value = setting.value.tgMsgTo
  tgChatId.value = []
  if (setting.value.tgChatId) {
    const list = setting.value.tgChatId.split(',')
    tgChatId.value.push(...list)
  }
  tgSettingShow.value = true
}

function openNoticePopupSetting() {
  noticePopupShow.value = true
}

function openResendList() {
  showResendList.value = true
}

function resetNoticeForm() {
  noticeForm.notice = setting.value.notice
  noticeForm.noticeContent = setting.value.noticeContent
  noticeForm.noticeDuration = setting.value.noticeDuration
  noticeForm.noticeTitle = setting.value.noticeTitle
  noticeForm.noticePosition = setting.value.noticePosition
  noticeForm.noticeType = setting.value.noticeType
  noticeForm.noticeOffset = setting.value.noticeOffset
  noticeForm.noticeWidth = setting.value.noticeWidth
}

function saveNoticePopup() {
  noticeForm.noticeOffset = noticeForm.noticeOffset || 0
  noticeForm.noticeWidth = noticeForm.noticeWidth || 0
  noticeForm.noticeDuration = noticeForm.noticeDuration || 0
  editSetting({...noticeForm})
}

function previewNoticePopup() {
  uiStore.previewNotice({...noticeForm})
}

function openThirdEmailSetting() {
  forwardEmail.value = []
  forwardStatus.value = setting.value.forwardStatus
  if (setting.value.forwardEmail) {
    const list = setting.value.forwardEmail.split(',')
    forwardEmail.value.push(...list)
  }
  thirdEmailShow.value = true
}

function openEmailPrefix() {
  emailPrefixShow.value = true
}

function openForwardRules() {
  ruleType.value = setting.value.ruleType
  ruleEmail.value = []
  if (setting.value.ruleEmail) {
    const list = setting.value.ruleEmail.split(',')
    ruleEmail.value.push(...list)
  }
  forwardRulesShow.value = true
}

function emailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  forwardEmail.value.splice(forwardEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !forwardEmail.value.includes(email)) {
      forwardEmail.value.push(email)
    }
  })
}

function ruleEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  ruleEmail.value.splice(ruleEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !ruleEmail.value.includes(email)) {
      ruleEmail.value.push(email)
    }
  })
}

function addChatTag(val) {

  const chatIds = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  tgChatId.value.splice(tgChatId.value.length - 1, 1)

  chatIds.forEach(id => {
    if (!isNaN(Number(id))) {
      tgChatId.value.push(id)
    }
  })
}

function clearS3() {

  const form = {
    bucket: '',
    endpoint: '',
    region: '',
    s3AccessKey: '',
    s3SecretKey: '',
    forcePathStyle: 1
  }
  clearS3Loading.value = true
  editSetting(form)
}

function saveS3() {

  const form = {
    bucket: s3.bucket,
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: s3.forcePathStyle
  }

  if (s3.s3AccessKey) form.s3AccessKey = s3.s3AccessKey
  if (s3.s3SecretKey) form.s3SecretKey = s3.s3SecretKey

  editSetting(form)
}

function tgBotSave() {
  const form = {
    customDomain: customDomain.value,
    tgBotStatus: tgBotStatus.value,
    tgChatId: tgChatId.value + '',
    tgMsgFrom: tgMsgFrom.value,
    tgMsgText: tgMsgText.value,
    tgMsgTo: tgMsgTo.value
  }
  if (tgBotToken.value) form.tgBotToken = tgBotToken.value
  editSetting(form)
}

function forwardEmailSave() {
  const form = {
    forwardStatus: forwardStatus.value,
    forwardEmail: forwardEmail.value + ''
  }
  editSetting(form)
}


function ruleEmailSave() {
  const form = {
    ruleEmail: ruleEmail.value + '',
    ruleType: ruleType.value
  }
  editSetting(form)
}

function doOpacityChange() {
  if (!settingReady.value) return
  const form = {}
  form.loginOpacity = loginOpacity.value
  editSetting(form, true)
}

function resetEmailPrefix() {
  minEmailPrefix.value = setting.value.minEmailPrefix
  emailPrefixFilter.value = setting.value.emailPrefixFilter
}

function resetBlackList() {
  blackListForm.value.blackFrom = setting.value.blackFrom ? setting.value.blackFrom.split(',') : []
  blackListForm.value.blackContent = setting.value.blackContent ? setting.value.blackContent.split(',') : []
  blackListForm.value.blackSubject = setting.value.blackSubject ? setting.value.blackSubject.split(',') : []
}

function resetAiCodeFilter() {
  aiCodeFilter.value = setting.value.aiCodeFilter ? setting.value.aiCodeFilter.split(',') : []
}

function saveEmailPrefix() {
  const form = {}
  form.minEmailPrefix = minEmailPrefix.value
  form.emailPrefixFilter = emailPrefixFilter.value
  editSetting(form, true)
}

function saveAiCodeFilter() {
  editSetting({aiCodeFilter: aiCodeFilter.value + ''})
}

const opacityChange = debounce(doOpacityChange, 1000, {
  leading: false,
  trailing: true
})

function saveBlackList() {

  let form = {
    blackContent: blackListForm.value.blackContent + '',
    blackSubject: blackListForm.value.blackSubject + '',
    blackFrom: blackListForm.value.blackFrom + ''
  }

  settingLoading.value = true

  setBlackList(form).then(() => {
    getSettings()
    ElMessage({
      message: t('setSuccess'),
      type: "success",
      plain: true
    })
    blackFormShow.value = false;
  }).finally(() => {
    settingLoading.value = false;
  })
}

function banEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  blackListForm.value.blackFrom.splice(blackListForm.value.blackFrom.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !blackListForm.value.blackFrom.includes(email)) {
      blackListForm.value.blackFrom.push(email)
    }
  })
}

function aiCodeFilterAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  aiCodeFilter.value.splice(aiCodeFilter.value.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !aiCodeFilter.value.includes(email)) {
      aiCodeFilter.value.push(email)
    }
  })
}


function delBackground() {
  ElMessageBox.confirm(t('delBackgroundConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    deleteBackground().then(() => {
      backgroundUrl.value = ''
      setting.value.background = null
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  })
}

function saveTurnstileKey() {
  const settingForm = {}
  settingForm.siteKey = turnstileForm.siteKey
  settingForm.secretKey = turnstileForm.secretKey
  editSetting(settingForm)
}

async function saveBackground() {

  let image = ''

  if (localUpShow.value) {
    image = await fileToBase64(backgroundFile, true);
  } else {
    if (backgroundUrl.value && !backgroundUrl.value.startsWith('http')) {
      ElMessage({
        message: t('imageLinkErrorMsg'),
        type: "error",
        plain: true
      })
      return
    }
    image = backgroundUrl.value
  }
  settingLoading.value = true

  setBackground(image).then(key => {
    setting.value.background = key
    showSetBackground.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    localUpShow.value = false
    backgroundImage.value = ''
  }).finally(() => {
    settingLoading.value = false
  })

}

function openSetBackground() {
  showSetBackground.value = true
}

function openCut() {
  const doc = document.createElement('input')
  doc.setAttribute('type', 'file')
  doc.setAttribute('accept', 'image/*')
  doc.click()
  doc.onchange = async (e) => {
    backgroundFile = e.target.files[0]
    backgroundImage.value = URL.createObjectURL(e.target.files[0])
    localUpShow.value = true
  }
}

function saveR2domain() {
  const settingForm = {r2Domain: r2DomainInput.value}
  editSetting(settingForm)
}

function openResendForm() {
  resendTokenFormShow.value = true
}

function openBlackListForm() {
  blackFormShow.value = true
}

function openAiCodeFilter() {
  aiCodeFilterShow.value = true
}

function saveResendToken() {
  const settingForm = {
    resendTokens: {}
  }
  const domain = resendTokenForm.domain.slice(1)
  settingForm.resendTokens[domain] = resendTokenForm.token
  editSetting(settingForm)
}

function backupSetting() {
  const settingForm = {...setting.value}
  delete settingForm.resendTokens
  delete settingForm.siteKey
  delete settingForm.secretKey
  backup = JSON.stringify(setting.value)
}

function cleanResendTokenForm() {
  resendTokenForm.token = ''
}

function beforeChange() {
  if (!settingReady.value || settingLoading.value) return false
  backupSetting()
  return true
}

function change(e) {
  if (!settingReady.value) return
  const settingForm = {...setting.value}
  delete settingForm.siteKey
  delete settingForm.secretKey
  delete settingForm.s3AccessKey
  delete settingForm.s3SecretKey
  delete settingForm.tgBotToken
  delete settingForm.resendTokens
  editSetting(settingForm, false)
}

function changeField(key, value) {
  if (!settingReady.value) return
  setting.value[key] = value
  editSetting({[key]: value}, false)
}

function saveTitle() {
  editSetting({title: editTitle.value})
}

function jump(href) {
  const doc = document.createElement('a')
  doc.href = href
  doc.target = '_blank'
  doc.click()
}

function editSetting(settingForm, refreshStatus = true) {
  if (settingLoading.value) return
  settingLoading.value = true

  settingSet(settingForm).then(() => {
    settingLoading.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    if (setting.value.manyEmail === 1) {
      accountStore.currentAccountId = userStore.user.account.accountId;
    }
    if (refreshStatus) {
      getSettings()
    }
    editTitleShow.value = false
    r2DomainShow.value = false
    resendTokenFormShow.value = false
    turnstileShow.value = false
    tgSettingShow.value = false
    thirdEmailShow.value = false
    forwardRulesShow.value = false
    addVerifyCountShow.value = false
    regVerifyCountShow.value = false
    noticePopupShow.value = false
    addS3Show.value = false
    emailPrefixShow.value = false
    aiCodeFilterShow.value = false
  }).catch((e) => {
    loginOpacity.value = setting.value.loginOpacity
    setting.value = {...setting.value, ...JSON.parse(backup)}
  }).finally(() => {
    settingLoading.value = false
    clearS3Loading.value = false
  })
}
// ===== 发信域名（Resend）=====
const sendDomainShow = ref(false)
const sendLoading = ref(false)
const sendKeyInput = ref('')
const sendDomainInput = ref('')
const sendInfo = reactive({hasKey: false, autoDns: false, list: []})
const sendRecords = reactive({name: '', records: []})

function sendStatusText(status) {
  return {verified: '已验证', pending: '验证中', not_started: '未开始', failed: '失败', temporary_failure: '暂时失败'}[status] || (status || '-')
}

async function loadSendDomains() {
  sendLoading.value = true
  try {
    const data = await resendDomainList()
    Object.assign(sendInfo, data)
  } catch (e) {} finally {
    sendLoading.value = false
  }
}

const senderText = ref('')

async function loadSenders() {
  try {
    const data = await sendSenderList()
    senderText.value = (data.emails || []).join('\n')
  } catch (e) {}
}

async function saveSenders() {
  sendLoading.value = true
  try {
    const data = await sendSenderSave(senderText.value)
    senderText.value = (data.emails || []).join('\n')
    ElMessage({message: data.emails.length ? `已保存 ${data.emails.length} 个发件地址，刷新页面后写信生效` : '已清空，写信时显示全部邮箱', type: 'success', plain: true})
  } catch (e) {} finally {
    sendLoading.value = false
  }
}

const sendSection = ref('domains')

function openSendDomain(section = 'domains') {
  sendSection.value = section
  sendDomainShow.value = true
  sendRecords.name = ''
  loadSendDomains()
  loadSenders()
}

async function saveSendKey() {
  sendLoading.value = true
  try {
    await resendSaveKey(sendKeyInput.value.trim())
    sendKeyInput.value = ''
    ElMessage({message: '密钥已保存，所有域名共用', type: 'success', plain: true})
    await loadSendDomains()
  } catch (e) {} finally {
    sendLoading.value = false
  }
}

async function addSendDomain() {
  const domain = sendDomainInput.value.trim()
  if (!domain) return
  sendLoading.value = true
  try {
    const data = await resendDomainAdd(domain)
    sendDomainInput.value = ''
    sendRecords.name = data.name
    sendRecords.records = data.records || []
    if (data.dnsError) {
      ElMessage({message: data.dnsError, type: 'warning', plain: true})
    } else {
      const failed = (data.dns || []).filter(item => item.status === 'failed')
      ElMessage({message: failed.length ? `有 ${failed.length} 条 DNS 记录写入失败，请看下方记录手动添加` : 'DNS 记录已写入，几分钟后点「验证」', type: failed.length ? 'warning' : 'success', plain: true})
    }
    await loadSendDomains()
  } catch (e) {} finally {
    sendLoading.value = false
  }
}

async function verifySendDomain(row) {
  sendLoading.value = true
  try {
    const data = await resendDomainVerify(row.id)
    sendRecords.name = data.name
    sendRecords.records = data.records || []
    ElMessage({message: `${data.name}：${sendStatusText(data.status)}`, type: data.status === 'verified' ? 'success' : 'info', plain: true})
    await loadSendDomains()
  } catch (e) {} finally {
    sendLoading.value = false
  }
}

async function showSendRecords(row) {
  sendLoading.value = true
  try {
    const data = await resendDomainGet(row.id)
    sendRecords.name = data.name
    sendRecords.records = data.records || []
  } catch (e) {} finally {
    sendLoading.value = false
  }
}

async function applySendDns(row) {
  sendLoading.value = true
  try {
    const data = await resendDomainApplyDns(row.id)
    const failed = (data.dns || []).filter(item => item.status === 'failed')
    ElMessage({message: failed.length ? `${failed.length} 条写入失败：${failed[0].message || ''}` : 'DNS 记录已写入', type: failed.length ? 'warning' : 'success', plain: true})
  } catch (e) {} finally {
    sendLoading.value = false
  }
}
// ===== 左侧分类 =====
const ssTabs = [
  {key: 'receive', label: '收信', icon: 'lucide:inbox'},
  {key: 'send', label: '发信', icon: 'lucide:send'},
  {key: 'notify', label: '通知 / 转发', icon: 'lucide:bell'},
  {key: 'account', label: '账号', icon: 'lucide:user'},
  {key: 'advanced', label: '高级', icon: 'lucide:sliders-horizontal'}
]
const ssTab = ref('receive')

// ===== 修改登录密码 =====
const pwdDialogShow = ref(false)
const pwdLoading = ref(false)
const pwdForm = reactive({password: '', again: ''})

async function savePwd() {
  if (pwdForm.password.length < 6) return ElMessage({message: '密码至少 6 位', type: 'error', plain: true})
  if (pwdForm.password !== pwdForm.again) return ElMessage({message: '两次输入不一样', type: 'error', plain: true})
  pwdLoading.value = true
  try {
    await resetPassword(pwdForm.password)
    pwdForm.password = ''
    pwdForm.again = ''
    pwdDialogShow.value = false
    ElMessage({message: '密码已修改，下次用新密码登录', type: 'success', plain: true})
  } catch (e) {} finally {
    pwdLoading.value = false
  }
}

// ===== 收件箱规则 =====
const inboxRulesShow = ref(false)
const inboxRulesLoading = ref(false)
const inboxApplyLoading = ref(false)
const inboxRules = reactive({enabled: true, marketingText: '', cleanSpamDays: 15, cleanInboxDays: 0, domainsText: '', subjectText: '', bodyText: '', fromText: '', replyToInbox: true})
let inboxDefaults = null

function fillInboxRules(r) {
  inboxRules.enabled = r.enabled !== false
  inboxRules.domainsText = (r.domains || []).join('\n')
  inboxRules.cleanSpamDays = Number(r.cleanSpamDays || 0)
  inboxRules.cleanInboxDays = Number(r.cleanInboxDays || 0)
  inboxRules.subjectText = (r.subject || []).join('\n')
  inboxRules.bodyText = (r.body || []).join('\n')
  inboxRules.marketingText = (r.marketing || []).join('\n')
  inboxRules.fromText = (r.from || []).join('\n')
  inboxRules.replyToInbox = r.replyToInbox !== false
}

const cleanShow = ref(false)

async function openClean() {
  cleanShow.value = true
  inboxRulesLoading.value = true
  try {
    const data = await inboxRulesGet()
    inboxDefaults = data.defaults
    fillInboxRules(data.rules)
  } catch (e) {} finally {
    inboxRulesLoading.value = false
  }
}

const ruleSection = ref('scope')
const ruleTitles = {scope: '开启分类 / 生效域名', important: '重要邮件关键词', marketing: '推广邮件关键词', from: '永远进收件箱的发件人'}

async function openInboxRules(section = 'scope') {
  ruleSection.value = section
  inboxRulesShow.value = true
  inboxRulesLoading.value = true
  try {
    const data = await inboxRulesGet()
    inboxDefaults = data.defaults
    fillInboxRules(data.rules)
  } catch (e) {} finally {
    inboxRulesLoading.value = false
  }
}

// 只恢复当前这一项的默认值
function resetInboxRules() {
  if (!inboxDefaults) return
  const d = inboxDefaults
  const join = (v) => (v || []).join('\n')
  if (ruleSection.value === 'scope') { inboxRules.enabled = d.enabled !== false; inboxRules.domainsText = join(d.domains) }
  if (ruleSection.value === 'important') { inboxRules.subjectText = join(d.subject); inboxRules.bodyText = join(d.body) }
  if (ruleSection.value === 'marketing') inboxRules.marketingText = join(d.marketing)
  if (ruleSection.value === 'from') inboxRules.fromText = join(d.from)
}

async function saveInboxRules() {
  inboxRulesLoading.value = true
  try {
    const split = (t) => t.split('\n').map(s => s.trim()).filter(Boolean)
    const data = await inboxRulesSave({enabled: inboxRules.enabled, domains: split(inboxRules.domainsText), cleanSpamDays: inboxRules.cleanSpamDays, cleanInboxDays: inboxRules.cleanInboxDays, subject: split(inboxRules.subjectText), body: split(inboxRules.bodyText), marketing: split(inboxRules.marketingText), from: split(inboxRules.fromText), replyToInbox: false})
    fillInboxRules(data.rules)
    ElMessage({message: '已保存，新邮件立即按此规则分类', type: 'success', plain: true})
  } catch (e) {} finally {
    inboxRulesLoading.value = false
  }
}

const inboxCleanLoading = ref(false)
const cleanSummary = computed(() => {
  const a = inboxRules.cleanSpamDays ? `垃圾邮箱 ${inboxRules.cleanSpamDays} 天后自动删除` : '垃圾邮箱不自动删除'
  const b = inboxRules.cleanInboxDays ? `，收件箱 ${inboxRules.cleanInboxDays} 天后自动删除` : ''
  return a + b
})
inboxRulesGet().then(data => { inboxDefaults = data.defaults; fillInboxRules(data.rules) }).catch(() => {})
resendDomainList().then(data => Object.assign(sendInfo, data)).catch(() => {})

async function cleanNow() {
  try {
    await ElMessageBox.confirm('会按保存过的天数立刻彻底删除旧邮件（改了天数请先点保存），删了不能恢复。继续？', '现在就清理', {confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'})
  } catch (e) {
    return
  }
  inboxCleanLoading.value = true
  try {
    const data = await inboxRulesClean()
    ElMessage({message: `已删除垃圾邮箱 ${data.spam} 封、收件箱 ${data.inbox} 封`, type: 'success', plain: true})
  } catch (e) {} finally {
    inboxCleanLoading.value = false
  }
}

async function applyInboxRules() {
  inboxApplyLoading.value = true
  try {
    const data = await inboxRulesApply(30)
    ElMessage({message: `检查了 ${data.scanned} 封：收件箱 +${data.toInbox}，其他通知 +${data.toOther}，垃圾邮件 +${data.toSpam}`, type: 'success', plain: true})
  } catch (e) {} finally {
    inboxApplyLoading.value = false
  }
}

// ===== 收信域名 =====
const mailDomainShow = ref(false)
const mailDomainLoading = ref(false)
const mailDomainInput = ref('')
const mailDomainSteps = ref([])
const mailDomainInfo = reactive({hasToken: true, list: []})
const mailTokenInput = ref('')
const mailTokenLoading = ref(false)

async function saveMailToken() {
  if (!mailTokenInput.value.trim()) return
  mailTokenLoading.value = true
  try {
    await mailDomainSaveToken(mailTokenInput.value.trim())
    mailTokenInput.value = ''
    ElMessage({message: '令牌已保存，以后部署也不会丢', type: 'success', plain: true})
    await loadMailDomains()
  } catch (e) {} finally {
    mailTokenLoading.value = false
  }
}

async function loadMailDomains() {
  mailDomainLoading.value = true
  try {
    Object.assign(mailDomainInfo, await mailDomainList())
  } catch (e) {} finally {
    mailDomainLoading.value = false
  }
}

const mailSection = ref('domains')

function openMailDomain(section = 'domains') {
  mailSection.value = section
  mailDomainShow.value = true
  mailDomainSteps.value = []
  loadMailDomains()
}

async function addMailDomain(removeOld) {
  const domain = mailDomainInput.value.trim()
  if (!domain) return
  mailDomainLoading.value = true
  try {
    const data = await mailDomainAdd(domain, removeOld)
    if (data.needConfirm) {
      mailDomainLoading.value = false
      try {
        await ElMessageBox.confirm(`${data.domain} 现在有这些旧的收信记录，继续会删除它们（原来的邮局将收不到这个域名的信）：${data.oldRecords.join('；')}`, '删除旧记录？', {confirmButtonText: '删除并继续', cancelButtonText: '取消', type: 'warning'})
      } catch (e) {
        return
      }
      return addMailDomain(true)
    }
    mailDomainSteps.value = data.steps || []
    mailDomainInput.value = ''
    ElMessage({message: `${data.domain} 已添加，刷新页面后各处可选`, type: 'success', plain: true})
    await loadMailDomains()
  } catch (e) {} finally {
    mailDomainLoading.value = false
  }
}

function removeMailDomain(row) {
  ElMessageBox.confirm(`从列表移除 ${row.domain}？不会改 DNS，也不会删除邮件和子邮箱；移除后这个域名的新邮件会进「无人收件」。`, {confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning'}).then(async () => {
    await mailDomainRemove(row.domain)
    await loadMailDomains()
  }).catch(() => {})
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
  overflow: hidden;
  background: var(--extra-light-fill) !important;
  position: relative;

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    z-index: 2;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    transition: var(--loading-hide-transition);
    pointer-events: none;
    opacity: 0;
  }
}

.scroll {
  width: 100%;
  min-height: 100%;

  :deep(.el-scrollbar__view) {
    height: 100%;
  }

  .scroll-body {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
}

.ss-wrap {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 100%;
  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}
.ss-nav {
  border-right: 1px solid var(--lq-border);
  padding: 18px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  @media (max-width: 767px) {
    flex-direction: row;
    flex-wrap: wrap;
    border-right: 0;
    border-bottom: 1px solid var(--lq-border);
    padding: 10px;
  }
  a {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 12px;
    border-radius: 6px;
    color: var(--lq-muted);
    cursor: pointer;
    span { color: var(--lq-text); }
    &:hover { background: var(--lq-hover); }
    &.on { background: var(--lq-active); color: var(--lq-text); span { font-weight: 600; } }
  }
}
.ss-nav-title {
  font-size: 12px;
  color: var(--lq-muted);
  padding: 0 12px 8px;
  @media (max-width: 767px) { display: none; }
}
.ss-body {
  padding: 24px 32px 48px;
  max-width: 860px;
  @media (max-width: 767px) { padding: 16px; }
}
.ss-card {
  background: transparent;
}
.ss-title {
  font-size: 20px;
  font-weight: 600;
  padding: 0 0 16px;
  color: var(--lq-text);
}
.ss-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--lq-border);
  .ss-title + &, .ss-sub + & { border-top: 1px solid var(--lq-border); }
}
.ss-sub {
  margin: 22px 0 4px;
  font-size: 12px;
  color: var(--lq-muted);
}
.ss-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  b { font-weight: 500; font-size: 14px; color: var(--lq-text); }
  span { font-size: 12px; color: var(--lq-muted); }
}
.card-grid {

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
  padding: 20px;
  gap: 20px;
  @media (max-width: 500px) {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  @media (max-width: 1023px) {
    gap: 15px;
    padding: 15px;
  }
}

.asset-sync-card {
  .sync-tips {
    color: var(--el-text-color-secondary);
    line-height: 1.6;
    font-size: 13px;
  }

  .sync-line {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;

    span {
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }

    strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-color-primary);
      background: var(--el-fill-color-light);
      border-radius: 6px;
      padding: 6px 8px;
    }
  }

  .advanced-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 4px;

    .el-button {
      margin-left: 0;
    }
  }

  @media (max-width: 560px) {
    .sync-line {
      grid-template-columns: 1fr auto;

      span {
        grid-column: 1 / -1;
      }
    }
  }
}

.background {
  width: 249px;
  height: 140px;
  border-radius: 4px;
  border: 1px solid var(--light-border);
  @media (max-width: 500px) {
    width: 160px;
    height: 90px;
  }
}

.background-btn {
  display: flex;
  gap: 10px;
  flex-direction: column;
}

.bot-verify-select {
  margin-left: 10px;
}

.settings-card {
  background-color: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  transition: all 300ms;
  overflow: hidden;
}


.card-title {
  font-size: 15px;
  font-weight: bold;
  padding: 10px 20px;
  border-bottom: 1px solid var(--el-border-color);
}

.card-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  font-weight: normal;

  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    display: grid;
    grid-template-columns: 1fr auto;
    justify-items: flex-end;
    font-weight: normal;
  }
}

.r2domain-item {
  display: flex;
  gap: 10px;
  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    flex: 1;
    text-align: right;
  }
}

.title-icon.warning {
  position: relative;
  top: 2px;
  cursor: pointer;
  margin-left: 2px;
}

.warning {
  margin-left: 2px;
  color: grey;
  cursor: pointer;
}

.cropper {
  border-radius: 4px;
  border: 1px solid #D4D7DE;
  height: 397px;
  width: 705px;
  @media (max-width: 767px) {
    width: calc(100vw - 60px);
    height: calc((100vw - 60px) * 9 / 16);
  }
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
}

.notice-popup-item {
  margin-top: 15px;
}

.notice-line-item {
  margin-top: 15px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;

  > * {
    width: 100%;
  }

  @media (max-width: 840px) {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
}

.background-url {
  width: min(calc(100vw - 70px), 500px);
}


:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.notice-popup.el-dialog) {
  min-height: 300px;
  width: 820px !important;
  @media (max-width: 860px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

:deep(.cut-dialog.el-dialog) {
  width: fit-content !important;
  height: fit-content !important;
}


:deep(.forward-dialog.el-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.forward-dialog {
  .forward-head {
    display: flex;
    align-items: center;

    .forward-set-title {
      top: 1px;
      padding-right: 5px;
      position: relative;
      font-size: 16px;
      font-weight: bold;;
    }
  }
}

.error-image {
  background: var(--light-ill);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cut-button {
  padding-top: 15px;
  width: 100%;
  display: flex;
  justify-content: space-between;

  .el-button {
    width: fit-content;
  }
}

.bot-verify {
  display: grid;
  grid-template-columns: 1fr auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  span {
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.forward-set-body {
  display: flex;
  flex-direction: column;

  .el-switch {
    align-self: end;
  }

  > *:nth-child(-n+2) {
    margin-bottom: 15px;
  }

  .tg-msg-label {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-select {
      width: v-bind(tgMsgLabelWidth);
    }
  }
}

.forward {
  span {
    display: flex;
    align-items: center;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.opt-button {
  width: fit-content !important;
}

.email-prefix {
  display: flex;
  justify-content: space-between;
}

.prefix-filter {
  display: flex;
  flex-direction: column;
}

.s3-button {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 15px;

  .el-button {
    margin-left: 0;
  }
}

.r2domain {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;

  .storage-type {
    margin-right: 3px;
  }

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.personalized {
  align-items: start;

  > div:last-child {
    display: flex;
    justify-content: end;

    .el-button {
      margin-left: 10px;
      margin-top: 0;
    }
  }
}

.dialog-input {
  margin-bottom: 15px;
}

.force-path-style {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  .force-path-style-left {
    padding-left: 2px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
  }
}

.concerning-item {
  display: flex;
  align-items: center;

  .community {
    display: flex;
    row-gap: 10px;
    flex-wrap: wrap;
  }

  :deep(.el-button) {
    padding: 0 10px;
    font-weight: normal;

    i {
      font-size: 22px;
    }
  }

  > span:first-child {
    font-weight: normal;
    padding-right: 20px;
    white-space: nowrap;
  }
}

.email-title {
  font-weight: normal !important;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto;
  align-items: center;

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    margin-top: 0;
  }
}

.token-item {
  padding-top: 0;

  div:last-child {
    font-weight: normal;
  }
}

form .el-button {
  margin-top: 10px;
  width: 100%;
}

.el-switch {
  height: 28px;
}


:deep(.el-button--small) {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  height: 24px;
}

:deep(.el-select__wrapper) {
  min-height: 28px;
}

</style>

<style>
.el-popper.is-dark {
}

.send-domain .sd-row { display: flex; gap: 8px; margin-bottom: 10px; }
.send-domain .sd-hint { color: var(--el-text-color-secondary); font-size: 12px; margin: 0 0 10px; }
.send-domain .sd-records { margin-top: 14px; }
.send-domain .sd-senders { margin-top: 16px; }
.send-domain .sd-title { font-weight: 600; margin-bottom: 6px; }
</style>
