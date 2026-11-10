window.__ModuleLoader__.load({
  id: "@local/dsh-agent-mailbox",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var ReactDOM = require("react-dom");
    var h = React.createElement;
    var PREFIX = "/agent-mailbox";

    var ZH = {
      title: "Agent Mailbox",
      subtitle: "统一管理外部消息来源。来源默认关闭，只有明确加入白名单的会话或分支才会进入 Agent 上下文。",
      refresh: "刷新",
      refreshing: "刷新中…",
      loading: "正在读取来源配置…",
      loadFailed: "读取配置失败",
      noSources: "没有支持配置的 Mailbox 来源",
      noSourcesHint: "安装并启用来源插件后，它的配置会出现在这里。",
      save: "保存",
      saving: "保存中…",
      revert: "撤销修改",
      unsaved: "有未保存修改",
      saved: "已保存",
      saveFailed: "保存失败",
      applyWarning: "配置已保存，但运行时应用失败",
      revisionConflict: "配置已被其他修改更新，请刷新后重试",
      sourceStatus: "来源状态",
      connected: "已连接",
      degraded: "降级运行",
      disconnected: "已停止",
      error: "错误",
      configInvalid: "已保存配置无法通过当前校验；来源已回退到安全默认值",
      instance: "实例",
      revision: "配置版本",
      collapseSource: "收起配置",
      expandSource: "展开配置",
      overviewMails: "暂存邮件",
      overviewPending: "待投递",
      overviewSubscriptions: "订阅",
      sourceCount: "个来源",
      security: "安全默认：未启用来源不会监听；未命中会话/分支白名单的事件不会发布到 Mailbox。",
      localOnly: "来源配置仅允许在本机修改。",
      chooseConversations: "选择会话",
      choose: "选择",
      manageSelected: "管理已选",
      pickerTitle: "选择要监控的会话",
      pickerSubtitle: "只有选中的会话，其新消息才会进入 Agent 上下文。",
      pickerHint: "点击会话切换选中状态；应用后请点击设置页的“保存”使其生效。",
      pickerSearch: "搜索会话名称",
      pickerSearchHint: "输入名称即时筛选",
      pickerEmpty: "没有匹配的会话",
      pickerLoadFailed: "加载会话失败",
      pickerClose: "关闭",
      pickerAvailable: "可选会话",
      pickerSortHint: "最近活跃优先",
      pickerSelected: "已选择 {n} 个会话",
      pickerNoSelected: "还没有选择会话",
      pickerClear: "清空",
      pickerApply: "应用选择",
      pickerCancel: "取消",
      pickerClearSearch: "清除搜索",
      pickerUnnamed: "未命名会话",
      selectedSummary: "已选择 {n} 个会话",
      configuredConversation: "已配置会话",
      loadMore: "加载更多",
      remove: "移除",
      addManual: "添加",
      valuePlaceholder: "输入值后添加",
      noValues: "尚未配置",
      authTitle: "身份与授权",
      checkAuth: "检查授权状态",
      authChecking: "检查中…",
      authHint: "只读取本机 lark-cli 登录态，不保存 token。",
      authAvailable: "可用",
      authUnavailable: "不可用",
      authAccount: "账号",
      authProfile: "CLI Profile",
      authCheckFailed: "检查授权失败",
      authNeverChecked: "尚未检查授权状态",
      fieldRequired: "必填",
      fieldOptional: "可选",
      more: "更多",
      pickerSearchFailed: "搜索失败",
      saveBlocked: "当前配置不能保存：请检查必填项和来源状态。",
      configuredAt: "最后保存",
      jnpmGroupTitle: "JNPM 工单系统",
      jnpmEnvironment: "选择环境",
      credentialTitle: "JNPM Token",
      credentialHint: "Token 仅写入 Harness 凭证服务，不进入来源配置 JSON；保存后立即用于后续只读请求。",
      credentialPlaceholder: "输入 JNPM Token",
      credentialSave: "保存 Token",
      credentialClear: "清除 Token",
      credentialConfigured: "Token 已配置",
      credentialMissing: "Token 未配置",
      credentialSaved: "Token 已保存到凭证服务",
      credentialCleared: "Token 已清除",
      credentialClearedFallback: "已清除可写凭证；当前仍使用环境变量中的只读 Token",
      credentialSaveFailed: "Token 保存失败",
      credentialStatusFailed: "Token 状态读取失败",
      credentialClearFailed: "Token 清除失败",
      credentialReadOnly: "当前凭证来源为只读，不能在此修改",
      credentialSource: "凭证来源",
      chooseConversationsProjects: "选择项目",
      pickerTitleProjects: "选择要监控的项目",
      pickerSubtitleProjects: "只有选中项目的新工单事件才会进入 Agent 上下文。",
      pickerHintProjects: "点击项目切换选中状态；应用后请点击设置页的“保存”使其生效。",
      pickerSearchProjects: "搜索项目名称",
      pickerEmptyProjects: "没有匹配的项目",
      pickerLoadFailedProjects: "加载项目失败",
      pickerAvailableProjects: "可选项目",
      pickerSortHintProjects: "按项目列表顺序",
      pickerSelectedProjects: "已选择 {n} 个项目",
      pickerNoSelectedProjects: "还没有选择项目",
      pickerUnnamedProjects: "未命名项目",
      configuredConversationProjects: "已配置项目",
      selectedSummaryProjects: "已选择 {n} 个项目",
      runtimeLimits: "核心容量",
      textLimit: "每条输入都有长度与数量限制；超限的事件会被来源丢弃或由核心返回背压。",
    };
    var EN = {
      title: "Agent Mailbox",
      subtitle: "Manage external event sources. Sources are disabled by default; only explicitly allowlisted conversations or branches can reach Agent context.",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      loading: "Loading source settings…",
      loadFailed: "Could not load settings",
      noSources: "No configurable Mailbox sources",
      noSourcesHint: "Install and enable a source plugin; its settings appear here.",
      save: "Save",
      saving: "Saving…",
      revert: "Revert changes",
      unsaved: "Unsaved changes",
      saved: "Saved",
      saveFailed: "Save failed",
      applyWarning: "Settings were saved but applying them at runtime failed",
      revisionConflict: "Settings changed elsewhere. Refresh and try again.",
      sourceStatus: "Source status",
      connected: "Connected",
      degraded: "Degraded",
      disconnected: "Stopped",
      error: "Error",
      configInvalid: "The stored configuration no longer validates; the source fell back to safe defaults.",
      instance: "Instance",
      revision: "Config revision",
      collapseSource: "Collapse settings",
      expandSource: "Expand settings",
      overviewMails: "Retained mail",
      overviewPending: "Pending",
      overviewSubscriptions: "Subscriptions",
      sourceCount: "sources",
      security: "Safe defaults: disabled sources do not listen, and events outside conversation/branch allowlists never reach Mailbox.",
      localOnly: "Source settings can be changed only from this machine.",
      chooseConversations: "Choose conversations",
      choose: "Choose",
      manageSelected: "Manage selected",
      pickerTitle: "Choose conversations to monitor",
      pickerSubtitle: "Only new messages from selected conversations enter the Agent context.",
      pickerHint: "Click a conversation to toggle it; after Apply, click Save on the settings card.",
      pickerSearch: "Search conversation name",
      pickerSearchHint: "Filter as you type",
      pickerEmpty: "No matching conversations",
      pickerLoadFailed: "Could not load conversations",
      pickerClose: "Close",
      pickerAvailable: "Available conversations",
      pickerSortHint: "Most recently active first",
      pickerSelected: "{n} selected",
      pickerNoSelected: "No conversations selected",
      pickerClear: "Clear",
      pickerApply: "Apply selection",
      pickerCancel: "Cancel",
      pickerClearSearch: "Clear search",
      pickerUnnamed: "Unnamed conversation",
      selectedSummary: "{n} conversations selected",
      configuredConversation: "Configured conversation",
      loadMore: "Load more",
      remove: "Remove",
      addManual: "Add",
      valuePlaceholder: "Enter a value to add",
      noValues: "Not configured",
      authTitle: "Identity and authorization",
      checkAuth: "Check authorization",
      authChecking: "Checking…",
      authHint: "Reads the existing local lark-cli session only; no token is stored.",
      authAvailable: "Available",
      authUnavailable: "Unavailable",
      authAccount: "Account",
      authProfile: "CLI profile",
      authCheckFailed: "Authorization check failed",
      authNeverChecked: "Authorization has not been checked",
      fieldRequired: "Required",
      fieldOptional: "Optional",
      more: "More",
      pickerSearchFailed: "Search failed",
      saveBlocked: "This configuration cannot be saved. Check required fields and source status.",
      configuredAt: "Last saved",
      jnpmGroupTitle: "JNPM issue tracking",
      jnpmEnvironment: "Environment",
      credentialTitle: "JNPM token",
      credentialHint: "The token is stored only in Harness credentials, never in source configuration JSON, and is used by subsequent read-only requests.",
      credentialPlaceholder: "Enter a JNPM token",
      credentialSave: "Save token",
      credentialClear: "Clear token",
      credentialConfigured: "Token configured",
      credentialMissing: "No token configured",
      credentialSaved: "Token saved to Harness credentials",
      credentialCleared: "Token cleared",
      credentialClearedFallback: "Writable credential cleared; the read-only environment token is still in use",
      credentialSaveFailed: "Could not save token",
      credentialStatusFailed: "Could not read token status",
      credentialClearFailed: "Could not clear token",
      credentialReadOnly: "This credential source is read-only and cannot be changed here",
      credentialSource: "Credential source",
      chooseConversationsProjects: "Choose projects",
      pickerTitleProjects: "Choose projects to monitor",
      pickerSubtitleProjects: "Only new issue events from selected projects enter the Agent context.",
      pickerHintProjects: "Click a project to toggle it; after Apply, click Save on the settings card.",
      pickerSearchProjects: "Search project name",
      pickerEmptyProjects: "No matching projects",
      pickerLoadFailedProjects: "Could not load projects",
      pickerAvailableProjects: "Available projects",
      pickerSortHintProjects: "Project list order",
      pickerSelectedProjects: "{n} projects selected",
      pickerNoSelectedProjects: "No projects selected",
      pickerUnnamedProjects: "Unnamed project",
      configuredConversationProjects: "Configured project",
      selectedSummaryProjects: "{n} projects selected",
      runtimeLimits: "Core capacity",
      textLimit: "Every input is bounded; oversized events are dropped by the source or returned as backpressure by the core.",
    };
    var t = function (key) { return ZH[key] || key; };
    var activeCtx;

    var CSS = [
      ".amb-page{max-width:820px;padding:4px 0 36px;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.55}",
      ".amb-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}.amb-head-main{flex:1;min-width:0}.amb-title{font-size:18px;line-height:1.35;font-weight:650;margin:0}.amb-sub{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;max-width:650px}",
      ".amb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}",
      ".amb-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".amb-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}",
      ".amb-btn.danger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
      ".amb-btn:disabled{opacity:.45;cursor:default}.amb-btn:focus-visible,.amb-input:focus-visible,.amb-select:focus-visible,.amb-switch:focus-visible,.amb-chip button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.amb-card-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-3px}",
      ".amb-overview{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:10px 12px;margin:0 0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}",
      ".amb-stat{display:flex;align-items:baseline;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}.amb-stat b{font-size:15px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}.amb-overview .amb-btn{margin-left:auto}",
      ".amb-note{display:flex;gap:8px;align-items:flex-start;padding:9px 11px;margin:0 0 16px;border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:5px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}",
      ".amb-error{margin:0 0 12px;padding:9px 11px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}",
      ".amb-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);margin:0 0 14px;overflow:hidden}",
      ".amb-jnpm-selector{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 10px;padding:0 2px}.amb-jnpm-selector .amb-select{min-width:180px}.amb-credential .amb-footer-status{margin-left:0}",
      ".amb-card-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;padding:12px 14px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;box-sizing:border-box;transition:background .15s,border-color .15s}.amb-card-head:hover{background:var(--dsw-alias-bg-base)}.amb-card.collapsed>.amb-card-head{border-bottom-color:transparent}",
      ".amb-source-heading{min-width:0}.amb-source-title{display:block;font-size:14px;font-weight:650;line-height:1.35}.amb-source-meta{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:3px;overflow-wrap:anywhere}",
      ".amb-card-content[hidden]{display:none}.amb-card-chevron{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--dsw-alias-label-secondary);font-size:20px;line-height:1;transform:rotate(90deg);transition:transform .15s}.amb-card.collapsed .amb-card-chevron{transform:rotate(0)}",
      ".amb-spacer{flex:1}.amb-badge{display:inline-flex;align-items:center;gap:5px;min-height:22px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}.amb-badge.dirty{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}",
      ".amb-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary)}.amb-badge.connected{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.amb-badge.connected .amb-dot{background:var(--dsw-alias-state-success-primary)}.amb-badge.degraded{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}.amb-badge.degraded .amb-dot{background:var(--dsw-alias-state-warn-primary)}.amb-badge.error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.amb-badge.error .amb-dot{background:var(--dsw-alias-state-error-primary)}",
      ".amb-card-body{padding:4px 14px 8px}.amb-source-diagnostic{margin:0 0 8px;padding:7px 9px;border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:4px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere}.amb-group{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.amb-group:last-of-type{border-bottom:0}.amb-group-title{font-size:12px;font-weight:650;margin:0 0 3px}.amb-group-desc{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 9px;max-width:660px}",
      ".amb-field{padding:10px 0;border-top:1px dashed var(--dsw-alias-border-l1)}.amb-field:first-of-type{border-top:0;padding-top:4px}.amb-field-head{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px}.amb-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}.amb-req{font-size:10px;color:var(--dsw-alias-state-warn-primary);border:1px solid var(--dsw-alias-state-warn-primary);border-radius:4px;padding:0 4px;margin-left:5px}.amb-hint{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:3px;max-width:650px}.amb-control{display:flex;align-items:center;gap:7px;flex-wrap:wrap}",
      ".amb-input,.amb-select{height:30px;min-width:220px;max-width:100%;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;box-sizing:border-box}",
      ".amb-input.grow{flex:1;min-width:180px;width:auto}.amb-input.number{width:150px;min-width:0}.amb-card-footer{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}.amb-footer-status{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:auto;overflow-wrap:anywhere}.amb-footer-status.ok{color:var(--dsw-alias-state-success-primary)}.amb-footer-status.error{color:var(--dsw-alias-state-error-primary)}",
      ".amb-switch{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;padding:0;cursor:pointer}.amb-switch-track{width:34px;height:19px;border-radius:99px;background:var(--dsw-alias-border-l2);position:relative;transition:background .15s;flex:none}.amb-switch[aria-checked=\"true\"] .amb-switch-track{background:var(--dsw-alias-brand-primary)}.amb-switch-thumb{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:left .15s}.amb-switch[aria-checked=\"true\"] .amb-switch-thumb{left:17px}",
      ".amb-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 7px}.amb-chip{display:inline-flex;align-items:center;gap:5px;min-height:25px;padding:0 5px 0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-base);font-size:11px;max-width:100%;overflow-wrap:anywhere}.amb-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}.amb-chip button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:1;cursor:pointer;padding:2px 3px}.amb-chip button:hover{color:var(--dsw-alias-state-error-primary)}",
      ".amb-empty-inline{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 7px}",
      ".amb-options{display:flex;flex-wrap:wrap;gap:6px}.amb-option{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);font-size:11px;color:var(--dsw-alias-label-primary);cursor:pointer}.amb-option input{accent-color:var(--dsw-alias-brand-primary);margin:0}.amb-option.on{border-color:var(--dsw-alias-brand-primary)}",
      ".amb-note-card{margin-top:12px;padding:10px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base)}.amb-note-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.amb-note-card-title{font-size:12px;font-weight:650}.amb-auth-list{display:flex;flex-direction:column;gap:6px;margin-top:8px}.amb-auth-row{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}.amb-auth-name{font-weight:600;color:var(--dsw-alias-label-primary);min-width:88px}.amb-auth-detail{margin-left:auto;text-align:right;max-width:100%;overflow-wrap:anywhere}",
      ".amb-selected-summary{padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);margin-bottom:8px}.amb-selected-summary .amb-chips{margin:0 0 4px}.amb-selected-text{font-size:11px;color:var(--dsw-alias-label-secondary)}",
      ".amb-picker-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.48)}",
      ".amb-picker-drawer{width:min(980px,96vw);height:min(700px,90vh);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden}",
      ".amb-picker-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}.amb-picker-title{font-size:15px;font-weight:650;line-height:1.3}.amb-picker-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px;line-height:1.45}",
      ".amb-picker-main{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.9fr);min-height:0;flex:1}.amb-picker-pane{display:flex;flex-direction:column;min-height:0;min-width:0}.amb-picker-pane + .amb-picker-pane{border-left:1px solid var(--dsw-alias-border-l1)}",
      ".amb-picker-pane-head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px;font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}.amb-picker-pane-note{color:var(--dsw-alias-label-tertiary);font-size:10px}",
      ".amb-picker-search{display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}.amb-picker-search input{flex:1;min-width:0}",
      ".amb-picker-list,.amb-picker-selected-list{overflow:auto;padding:6px 8px;flex:1;min-height:0}",
      ".amb-picker-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;box-sizing:border-box}.amb-picker-row:hover{background:var(--dsw-alias-bg-base)}.amb-picker-row.on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base)}",
      ".amb-picker-check{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;flex:none;font-size:12px;font-weight:700;color:transparent}.amb-picker-row.on .amb-picker-check{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}",
      ".amb-picker-info{flex:1;min-width:0}.amb-picker-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}.amb-picker-desc{font-size:10px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow-wrap:anywhere}",
      ".amb-picker-empty{padding:24px 14px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}",
      ".amb-picker-selected-row{display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px}.amb-picker-selected-name{flex:1;min-width:0;overflow-wrap:anywhere}.amb-picker-selected-row button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1;padding:2px 4px}.amb-picker-selected-row button:hover{color:var(--dsw-alias-state-error-primary)}",
      ".amb-picker-foot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:none;background:var(--dsw-alias-bg-base)}.amb-picker-foot-hint{flex:1;font-size:10px;color:var(--dsw-alias-label-secondary);min-width:0}.amb-picker-more{padding:9px 14px;border-top:1px solid var(--dsw-alias-border-l1);text-align:center;flex:none}",
      ".amb-skeleton{padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}",
      "@media(max-width:640px){.amb-page{padding-bottom:24px}.amb-head{flex-direction:column;gap:10px}.amb-card-head,.amb-card-body,.amb-card-footer{padding-left:10px;padding-right:10px}.amb-input,.amb-select{min-width:0;width:100%}.amb-auth-detail{margin-left:0;text-align:left;flex-basis:100%}}",
      "@media(max-width:760px){.amb-picker-overlay{padding:0}.amb-picker-drawer{width:100vw;height:100vh;max-height:none;border-radius:0;border:0}.amb-picker-main{display:flex;flex-direction:column;overflow:auto}.amb-picker-pane{min-height:300px}.amb-picker-pane + .amb-picker-pane{border-left:0;border-top:1px solid var(--dsw-alias-border-l1)}.amb-picker-list,.amb-picker-selected-list{max-height:280px}.amb-picker-foot-hint{display:none}}",
      "@media(prefers-reduced-motion:reduce){.amb-btn,.amb-card-head,.amb-card-chevron,.amb-switch-track,.amb-switch-thumb{transition:none}}",
    ].join("");

    function localeIsZh() {
      try { return String(activeCtx?.locale?.getLocale?.().active || "").toLowerCase().startsWith("zh"); }
      catch { return true; }
    }
    function pick(value, fallback) {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        return localeIsZh() ? (value.zh || value.en || fallback || "") : (value.en || value.zh || fallback || "");
      }
      return fallback || "";
    }
    function sourceText(sourceKey, key) {
      if (String(sourceKey || "").startsWith("jnpm:")) {
        var projectKey = key + "Projects";
        var localized = t(projectKey);
        if (localized !== projectKey) return localized;
      }
      return t(key);
    }
    function errorText(error) { return String(error && error.message ? error.message : error || "unknown error"); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    var LABEL_CACHE = {};
    var PICKER_SEARCH_SEQ = 0;
    function labelKey(sourceKey, value) { return sourceKey + "\u0000" + value; }
    function rememberLabels(sourceKey, items) {
      for (var i = 0; i < (items || []).length; i += 1) {
        if (items[i] && items[i].value && items[i].label) LABEL_CACHE[labelKey(sourceKey, items[i].value)] = items[i].label;
      }
    }
    function labelFor(sourceKey, value) { return LABEL_CACHE[labelKey(sourceKey, value)] || ""; }
    function labelsFor(sourceKey, values) {
      var labels = {};
      for (var i = 0; i < (values || []).length; i += 1) labels[values[i]] = labelFor(sourceKey, values[i]);
      return labels;
    }
    async function request(path, options) {
      var response = await fetch(PREFIX + path, Object.assign({ cache: "no-store" }, options || {}));
      var data;
      try { data = await response.json(); } catch { throw new Error("HTTP " + response.status); }
      if (!response.ok || !data || data.ok !== true) {
        var error = new Error(data && data.error ? data.error : "HTTP " + response.status);
        error.code = data && data.code;
        error.status = response.status;
        throw error;
      }
      return data;
    }
    function post(path, payload) {
      return request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    }
    function statusLabel(state) {
      return t(state === "connected" ? "connected" : state === "degraded" ? "degraded" : state === "error" ? "error" : "disconnected");
    }
    function badgeClass(state) {
      return state === "connected" ? "connected" : state === "degraded" ? "degraded" : state === "error" ? "error" : "";
    }

    function useLocaleRevision(ctx) {
      var pair = React.useState(0);
      var setRevision = pair[1];
      React.useEffect(function () {
        return ctx.locale.subscribe(function () { setRevision(ctx.locale.getSnapshot().revision); });
      }, [ctx]);
      return pair[0];
    }

    function FieldLabel(props) {
      return h("div", { className: "amb-field-head" },
        h("span", null,
          h("span", { className: "amb-label" }, pick(props.field.labelI18n)),
          props.field.required ? h("span", { className: "amb-req" }, t("fieldRequired")) : null,
          props.field.hintI18n ? h("span", { className: "amb-hint" }, pick(props.field.hintI18n)) : null
        )
      );
    }

    function Switch(props) {
      return h("button", {
        type: "button",
        className: "amb-switch",
        role: "switch",
        "aria-checked": props.checked ? "true" : "false",
        "aria-label": pick(props.field.labelI18n),
        onClick: function () { props.onChange(!props.checked); },
      }, h("span", { className: "amb-switch-track", "aria-hidden": "true" }, h("span", { className: "amb-switch-thumb" })), h("span", null, props.checked ? (localeIsZh() ? "已启用" : "Enabled") : (localeIsZh() ? "已关闭" : "Disabled")));
    }

    function StringListField(props) {
      var values = Array.isArray(props.value) ? props.value : [];
      var labels = props.labels || {};
      var pair = React.useState("");
      var value = pair[0];
      var setValue = pair[1];
      if (props.field.suggestionsAction) {
        var known = values.map(function (item) { return labels[item] || ""; }).filter(Boolean);
        var shown = known.slice(0, 3);
        return h("div", null,
          values.length
            ? h("div", { className: "amb-selected-summary" },
              shown.length ? h("div", { className: "amb-chips" }, shown.map(function (name, index) {
                return h("span", { className: "amb-chip", key: name + index }, h("span", { title: name }, name));
              }).concat(values.length > shown.length
                ? [h("span", { className: "amb-chip", key: "__more" }, "+" + String(values.length - shown.length))]
                : [])) : null,
              h("div", { className: "amb-selected-text" }, sourceText(props.sourceKey, "selectedSummary").replace("{n}", String(values.length)))
            )
            : h("p", { className: "amb-empty-inline" }, t("noValues")),
          h("div", { className: "amb-control" },
            h("button", { type: "button", className: "amb-btn primary", onClick: function () { props.onSuggest(); } }, values.length ? t("manageSelected") : sourceText(props.sourceKey, "chooseConversations"))
          )
        );
      }
      function add(next) {
        var text = String(next || "").trim();
        if (!text || values.indexOf(text) >= 0) return;
        props.onChange(values.concat([text]));
        setValue("");
      }
      var chips = values.length ? h("div", { className: "amb-chips" }, values.map(function (item) {
        return h("span", { className: "amb-chip", key: item }, h("span", { title: item }, labels[item] || item), h("button", { type: "button", "aria-label": t("remove"), onClick: function () { props.onChange(values.filter(function (candidate) { return candidate !== item; })); } }, "×"));
      })) : h("p", { className: "amb-empty-inline" }, t("noValues"));
      return h("div", null,
        chips,
        h("div", { className: "amb-control" },
          h("input", {
            className: "amb-input grow",
            value: value,
            placeholder: pick(props.field.placeholderI18n, t("valuePlaceholder")),
            onChange: function (event) { setValue(event.target.value); },
            onKeyDown: function (event) { if (event.key === "Enter") { event.preventDefault(); add(value); } },
          }),
          h("button", { type: "button", className: "amb-btn", disabled: !value.trim(), onClick: function () { add(value); } }, t("addManual"))
        )
      );
    }

    function Picker(props) {
      var picker = props.picker;
      var selectedPair = React.useState(Array.isArray(picker.selected) ? picker.selected : []);
      var selected = selectedPair[0];
      var setSelected = selectedPair[1];
      var queryPair = React.useState(picker.query || "");
      var query = queryPair[0];
      var setQuery = queryPair[1];
      var items = Array.isArray(picker.items) ? picker.items : [];
      var itemMap = {};
      for (var i = 0; i < items.length; i += 1) itemMap[items[i].value] = items[i];
      var selectedItems = selected.map(function (value) {
        var item = itemMap[value];
        return { value: value, label: item && item.label ? item.label : (labelFor(picker.sourceKey, value) || sourceText(picker.sourceKey, "configuredConversation")) };
      });
      function toggle(value) {
        setSelected(selected.indexOf(value) >= 0
          ? selected.filter(function (candidate) { return candidate !== value; })
          : selected.concat([value]));
      }
      function kindLabel(description) {
        if (description === "group") return localeIsZh() ? "群聊" : "Group";
        if (description === "p2p") return localeIsZh() ? "单聊" : "Direct";
        return description || "";
      }
      React.useEffect(function () {
        var timer = setTimeout(function () {
          if (query !== picker.query) props.onSearch(query);
        }, 300);
        return function () { clearTimeout(timer); };
      }, [query, picker.query]);
      React.useEffect(function () {
        function onKey(event) { if (event.key === "Escape") props.onClose(); }
        document.addEventListener("keydown", onKey);
        return function () { document.removeEventListener("keydown", onKey); };
      }, []);
      var content = h("div", {
        className: "amb-picker-overlay",
        onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); },
      },
        h("div", { className: "amb-picker-drawer", role: "dialog", "aria-modal": "true", "aria-label": sourceText(picker.sourceKey, "pickerTitle") },
          h("div", { className: "amb-picker-head" },
            h("div", { style: { flex: 1, minWidth: 0 } },
              h("div", { className: "amb-picker-title" }, sourceText(picker.sourceKey, "pickerTitle")),
              h("div", { className: "amb-picker-sub" }, sourceText(picker.sourceKey, "pickerSubtitle"))
            ),
            h("button", { type: "button", className: "amb-btn", "aria-label": t("pickerClose"), onClick: props.onClose }, "×")
          ),
          h("div", { className: "amb-picker-main" },
            h("div", { className: "amb-picker-pane" },
              h("div", { className: "amb-picker-pane-head" }, sourceText(picker.sourceKey, "pickerAvailable"), h("span", { className: "amb-picker-pane-note" }, sourceText(picker.sourceKey, "pickerSortHint")), h("span", { className: "amb-spacer" }), picker.loading ? h("span", null, t("refreshing")) : null),
              h("div", { className: "amb-picker-search" },
                h("input", {
                  className: "amb-input grow",
                  value: query,
                  placeholder: sourceText(picker.sourceKey, "pickerSearch"),
                  autoFocus: true,
                  onChange: function (event) { setQuery(event.target.value); },
                  onKeyDown: function (event) { if (event.key === "Enter") { event.preventDefault(); props.onSearch(query); } },
                }),
                query ? h("button", { type: "button", className: "amb-btn", "aria-label": t("pickerClearSearch"), onClick: function () { setQuery(""); } }, "×") : null
              ),
              picker.error ? h("div", { className: "amb-error", style: { margin: "8px 12px" } }, picker.error) : null,
              h("div", { className: "amb-picker-list" },
                picker.loading && !items.length ? h("div", { className: "amb-picker-empty" }, t("loading")) :
                !items.length ? h("div", { className: "amb-picker-empty" }, sourceText(picker.sourceKey, "pickerEmpty")) :
                items.map(function (item) {
                  var on = selected.indexOf(item.value) >= 0;
                  return h("button", {
                    type: "button",
                    className: "amb-picker-row" + (on ? " on" : ""),
                    key: item.value,
                    "aria-pressed": on ? "true" : "false",
                    onClick: function () { toggle(item.value); },
                  },
                    h("span", { className: "amb-picker-check", "aria-hidden": "true" }, on ? "✓" : ""),
                    h("div", { className: "amb-picker-info" },
                      h("div", { className: "amb-picker-name" }, item.label || sourceText(picker.sourceKey, "pickerUnnamed")),
                      item.description ? h("div", { className: "amb-picker-desc" }, kindLabel(item.description)) : null
                    )
                  );
                })
              ),
              picker.hasMore && picker.nextToken ? h("div", { className: "amb-picker-more" },
                h("button", { type: "button", className: "amb-btn", disabled: picker.loading, onClick: props.onLoadMore }, picker.loading ? t("refreshing") : t("loadMore"))
              ) : null
            ),
            h("div", { className: "amb-picker-pane" },
              h("div", { className: "amb-picker-pane-head" },
                h("span", null, sourceText(picker.sourceKey, "pickerSelected").replace("{n}", String(selected.length))),
                h("span", { className: "amb-spacer" }),
                selected.length ? h("button", { type: "button", className: "amb-btn", onClick: function () { setSelected([]); } }, t("pickerClear")) : null
              ),
              h("div", { className: "amb-picker-selected-list" },
                selectedItems.length ? selectedItems.map(function (item) {
                  return h("div", { className: "amb-picker-selected-row", key: item.value },
                    h("span", { className: "amb-picker-selected-name", title: item.label }, item.label),
                    h("button", { type: "button", "aria-label": t("remove") + " " + item.label, onClick: function () { toggle(item.value); } }, "×")
                  );
                }) : h("div", { className: "amb-picker-empty" }, sourceText(picker.sourceKey, "pickerNoSelected"))
              )
            )
          ),
          h("div", { className: "amb-picker-foot" },
            h("span", { className: "amb-picker-foot-hint" }, sourceText(picker.sourceKey, "pickerHint")),
            h("button", { type: "button", className: "amb-btn", onClick: props.onClose }, t("pickerCancel")),
            h("button", { type: "button", className: "amb-btn primary", onClick: function () { props.onApply(selected); } }, t("pickerApply") + (selected.length ? " (" + String(selected.length) + ")" : ""))
          )
        )
      );
      return ReactDOM.createPortal(content, document.body);
    }

    function isFieldVisible(field, draft) {
      if (!field.visibleWhen) return true;
      var actual = draft ? draft[field.visibleWhen.key] : undefined;
      return Array.isArray(field.visibleWhen.in) && field.visibleWhen.in.indexOf(actual) >= 0;
    }

    function Field(props) {
      var field = props.field;
      var value = props.value;
      if (field.type === "boolean") {
        return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h("div", { className: "amb-control" }, h(Switch, { field: field, checked: value === true, onChange: props.onChange })));
      }
      if (field.type === "select") {
        return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h("div", { className: "amb-control" },
          h("select", { className: "amb-select", value: value || "", onChange: function (event) { props.onChange(event.target.value); } },
            (field.options || []).map(function (option) { return h("option", { key: option.value, value: option.value }, pick(option.labelI18n, option.value)); })
          )
        ));
      }
      if (field.type === "multi-select") {
        var values = Array.isArray(value) ? value : [];
        return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h("div", { className: "amb-options" },
          (field.options || []).map(function (option) {
            var on = values.indexOf(option.value) >= 0;
            return h("label", { className: "amb-option" + (on ? " on" : ""), key: option.value },
              h("input", { type: "checkbox", checked: on, onChange: function () {
                props.onChange(on ? values.filter(function (candidate) { return candidate !== option.value; }) : values.concat([option.value]));
              } }),
              pick(option.labelI18n, option.value)
            );
          })
        ));
      }
      if (field.type === "string-list") {
        return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h(StringListField, {
          field: field,
          value: value,
          labels: labelsFor(props.sourceKey, Array.isArray(value) ? value : []),
          onChange: props.onChange,
          onSuggest: function () { props.onSuggest(field); },
        }));
      }
      if (field.type === "number") {
        return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h("div", { className: "amb-control" },
          h("input", {
            className: "amb-input number",
            type: "number",
            min: field.min,
            max: field.max,
            step: field.step || 1,
            value: value === undefined || value === null ? "" : String(value),
            onChange: function (event) {
              var raw = event.target.value;
              props.onChange(raw === "" ? "" : Number(raw));
            },
          })
        ));
      }
      if (field.type === "textarea") {
        return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h("textarea", {
          className: "amb-input grow",
          rows: 4,
          value: value || "",
          onChange: function (event) { props.onChange(event.target.value); },
          style: { minHeight: "84px", paddingTop: "7px", paddingBottom: "7px", resize: "vertical" },
        }));
      }
      return h("div", { className: "amb-field" }, h(FieldLabel, { field: field }), h("div", { className: "amb-control" },
        h("input", { className: "amb-input grow", value: value || "", onChange: function (event) { props.onChange(event.target.value); } })
      ));
    }

    function AuthPanel(props) {
      var source = props.source;
      var auth = source.settings.auth;
      if (!auth) return null;
      var result = props.result;
      return h("div", { className: "amb-note-card" },
        h("div", { className: "amb-note-card-head" },
          h("span", { className: "amb-note-card-title" }, pick(auth.titleI18n, t("authTitle"))),
          h("span", { className: "amb-spacer" }),
          h("button", { type: "button", className: "amb-btn", disabled: props.busy, onClick: props.onCheck }, props.busy ? t("authChecking") : pick(auth.refreshLabelI18n, t("checkAuth")))
        ),
        h("div", { className: "amb-hint" }, pick(auth.hintI18n, t("authHint"))),
        result && result.profile ? h("div", { className: "amb-hint" }, t("authProfile") + ": " + result.profile) : null,
        result ? h("div", { className: "amb-auth-list" }, (result.identities || []).map(function (identity) {
          return h("div", { className: "amb-auth-row", key: identity.id },
            h("span", { className: "amb-auth-name" }, pick(identity.label, identity.id)),
            h("span", { className: "amb-badge " + (identity.available ? "connected" : "error") }, h("span", { className: "amb-dot" }), identity.available ? t("authAvailable") : t("authUnavailable")),
            identity.account ? h("span", null, t("authAccount") + ": " + identity.account) : null,
            h("span", { className: "amb-auth-detail" }, identity.detail || identity.status || "")
          );
        })) : h("div", { className: "amb-hint", style: { marginTop: "7px" } }, t("authNeverChecked"))
      );
    }

    var JNPM_TOKEN_REFS = {
      prod: "JNPM_PROD_PRIVATE_TOKEN",
      gz: "JNPM_GZ_PRIVATE_TOKEN",
      hgame: "JNPM_HGAME_PRIVATE_TOKEN",
      neon: "JNPM_NEON_PRIVATE_TOKEN",
    };

    function CredentialPanel(props) {
      var source = props.source;
      var definition = props.definition || {};
      var ref = definition.ref || JNPM_TOKEN_REFS[source.instance];
      var secret = definition.secret !== false;
      var tokenPair = React.useState("");
      var token = tokenPair[0];
      var setToken = tokenPair[1];
      var infoPair = React.useState(null);
      var info = infoPair[0];
      var setInfo = infoPair[1];
      var busyPair = React.useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];
      var messagePair = React.useState(null);
      var message = messagePair[0];
      var setMessage = messagePair[1];
      React.useEffect(function () {
        var active = true;
        setInfo(null);
        setMessage(null);
        setToken("");
        props.actions.describe(ref).then(function (value) {
          if (active) setInfo(value);
        }).catch(function (error) {
          if (active) setMessage({ kind: "error", text: t("credentialStatusFailed") + ": " + errorText(error) });
        });
        return function () { active = false; };
      }, [source.sourceKey, ref]);
      async function saveToken() {
        var value = token.trim();
        if (!value || busy) return;
        setBusy(true);
        setMessage(null);
        try {
          await props.actions.set(ref, value);
          setToken("");
          var next = await props.actions.describe(ref);
          setInfo(next);
          setMessage({ kind: "ok", text: t("credentialSaved") });
        } catch (error) {
          setMessage({ kind: "error", text: t("credentialSaveFailed") + ": " + errorText(error) });
        } finally {
          setBusy(false);
        }
      }
      async function clearToken() {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
          await props.actions.unset(ref);
          var next = await props.actions.describe(ref);
          setInfo(next);
          setMessage({ kind: "ok", text: next && next.configured ? t("credentialClearedFallback") : t("credentialCleared") });
        } catch (error) {
          setMessage({ kind: "error", text: t("credentialClearFailed") + ": " + errorText(error) });
        } finally {
          setBusy(false);
        }
      }
      var readOnly = info && info.writable === false;
      return h("div", { className: "amb-note-card amb-credential" },
        h("div", { className: "amb-note-card-head" },
          h("span", { className: "amb-note-card-title" }, pick(definition.labelI18n, t("credentialTitle"))),
          h("span", { className: "amb-spacer" }),
          h("span", { className: "amb-badge " + (info && info.configured ? "connected" : "") },
            h("span", { className: "amb-dot" }), info && info.configured ? t("credentialConfigured") : t("credentialMissing"))
        ),
        h("div", { className: "amb-hint" }, pick(definition.hintI18n, t("credentialHint"))),
        h("div", { className: "amb-control", style: { marginTop: "8px" } },
          h("input", {
            className: "amb-input grow",
            type: secret ? "password" : "text",
            value: token,
            placeholder: pick(definition.placeholderI18n, t("credentialPlaceholder")),
            autoComplete: "off",
            disabled: busy || readOnly,
            onChange: function (event) { setToken(event.target.value); },
          }),
          h("button", { type: "button", className: "amb-btn primary", disabled: busy || readOnly || !token.trim(), onClick: saveToken }, t("credentialSave")),
          h("button", { type: "button", className: "amb-btn danger", disabled: busy || readOnly || !info || !info.configured, onClick: clearToken }, t("credentialClear"))
        ),
        info && info.source ? h("div", { className: "amb-hint", style: { marginTop: "6px" } }, t("credentialSource") + ": " + info.source + (readOnly ? " · " + t("credentialReadOnly") : "")) : null,
        readOnly && !(info && info.source) ? h("div", { className: "amb-hint", style: { marginTop: "6px" } }, t("credentialReadOnly")) : null,
        message ? h("div", { className: "amb-footer-status " + (message.kind === "error" ? "error" : "ok"), style: { marginTop: "6px" } }, message.text) : null
      );
    }

    function SourceCard(props) {
      var source = props.source;
      var draft = props.draft;
      var dirty = JSON.stringify(draft) !== JSON.stringify(source.config);
      var collapsedPair = React.useState(true);
      var collapsed = collapsedPair[0];
      var setCollapsed = collapsedPair[1];
      var sourceName = source.displayName || source.sourceId;
      var contentId = "amb-source-" + String(source.sourceKey).replace(/[^a-zA-Z0-9_-]/g, "-") + "-content";
      var picker = props.picker && props.picker.sourceKey === source.sourceKey ? props.picker : null;
      var credentialDefinitions = Array.isArray(source.settings.credentials)
        ? source.settings.credentials
        : (source.sourceId === "jnpm" ? [{ ref: JNPM_TOKEN_REFS[source.instance] }] : []);
      React.useEffect(function () {
        var groups = source.settings.groups || [];
        for (var i = 0; i < groups.length; i += 1) {
          var fields = groups[i].fields || [];
          for (var j = 0; j < fields.length; j += 1) {
            var field = fields[j];
            var values = draft[field.key];
            if (isFieldVisible(field, draft) && field.suggestionsAction && Array.isArray(values) && values.some(function (value) { return !labelFor(source.sourceKey, value); })) {
              if (typeof props.onLoadLabels === "function") props.onLoadLabels(source, field);
            }
          }
        }
      }, [draft.identityMode]);
      return h("section", { className: "amb-card" + (collapsed ? " collapsed" : "") },
        h("button", {
          type: "button",
          className: "amb-card-head",
          "aria-expanded": collapsed ? "false" : "true",
          "aria-controls": contentId,
          "aria-label": (collapsed ? t("expandSource") : t("collapseSource")) + ": " + sourceName,
          title: collapsed ? t("expandSource") : t("collapseSource"),
          onClick: function () { setCollapsed(!collapsed); },
        },
          h("span", { className: "amb-source-heading" },
            h("span", { className: "amb-source-title" }, sourceName),
            h("span", { className: "amb-source-meta" }, t("instance") + ": " + source.instance + " · " + t("revision") + ": " + source.revision)
          ),
          h("span", { className: "amb-spacer" }),
          dirty && collapsed ? h("span", { className: "amb-badge dirty" }, t("unsaved")) : null,
          h("span", { className: "amb-badge " + badgeClass(source.status.state) }, h("span", { className: "amb-dot" }), statusLabel(source.status.state)),
          h("span", { className: "amb-card-chevron", "aria-hidden": "true" }, "›")
        ),
        h("div", { id: contentId, className: "amb-card-content", hidden: collapsed },
        h("div", { className: "amb-card-body" },
          source.configError ? h("div", { className: "amb-error" }, t("configInvalid") + ": " + source.configError) : null,
          source.status.detail && (source.status.state === "degraded" || source.status.state === "error")
            ? h("div", { className: "amb-source-diagnostic" }, source.status.detail)
            : null,
          (source.settings.groups || []).map(function (group) {
            return h("div", { className: "amb-group", key: group.id },
              h("h3", { className: "amb-group-title" }, pick(group.titleI18n, group.id)),
              group.descriptionI18n ? h("p", { className: "amb-group-desc" }, pick(group.descriptionI18n)) : null,
              (group.fields || []).map(function (field) {
                if (!isFieldVisible(field, draft)) return null;
                return h(Field, {
                  key: field.key,
                  field: field,
                  sourceKey: source.sourceKey,
                  value: draft[field.key],
                  onChange: function (value) { props.onField(field.key, value); },
                  onSuggest: function (target) { props.onSuggest(target); },
                });
              })
            );
          }),
          picker ? h(Picker, {
            key: picker.sourceKey + "\u0000" + picker.fieldKey,
            picker: picker,
            onClose: props.onPickerClose,
            onSearch: props.onPickerSearch,
            onLoadMore: props.onPickerLoadMore,
            onApply: props.onPickerApply,
          }) : null,
          credentialDefinitions.length ? h("div", { className: "amb-group" },
            credentialDefinitions.map(function (definition) {
              return h(CredentialPanel, {
                key: definition.ref,
                source: source,
                definition: definition,
                actions: props.credentialActions,
              });
            })
          ) : null,
          source.settings.auth ? h("div", { className: "amb-group" },
            h(AuthPanel, { source: source, result: props.authResult, busy: props.authBusy, onCheck: props.onAuth })
          ) : null
        ),
        h("div", { className: "amb-card-footer" },
          h("button", { type: "button", className: "amb-btn primary", disabled: props.saving || !dirty, onClick: props.onSave }, props.saving ? t("saving") : t("save")),
          h("button", { type: "button", className: "amb-btn", disabled: props.saving || !dirty, onClick: props.onRevert }, t("revert")),
          h("span", { className: "amb-footer-status " + (props.message && props.message.kind === "error" ? "error" : props.message && props.message.kind === "ok" ? "ok" : "") },
            props.message ? props.message.text : (dirty ? t("unsaved") : t("saved"))
          )
        )
        )
      );
    }

    function SectionView(props) {
      var ctx = props.ctx;
      useLocaleRevision(ctx);
      var dataPair = React.useState(null); var data = dataPair[0]; var setData = dataPair[1];
      var loadingPair = React.useState(true); var loading = loadingPair[0]; var setLoading = loadingPair[1];
      var errorPair = React.useState(""); var error = errorPair[0]; var setError = errorPair[1];
      var draftPair = React.useState({}); var drafts = draftPair[0]; var setDrafts = draftPair[1];
      var savingPair = React.useState(""); var saving = savingPair[0]; var setSaving = savingPair[1];
      var messagePair = React.useState({}); var messages = messagePair[0]; var setMessages = messagePair[1];
      var authPair = React.useState({}); var authResults = authPair[0]; var setAuthResults = authPair[1];
      var authBusyPair = React.useState(""); var authBusy = authBusyPair[0]; var setAuthBusy = authBusyPair[1];
      var pickerPair = React.useState(null); var picker = pickerPair[0]; var setPicker = pickerPair[1];
      var jnpmInstancePair = React.useState("prod");
      var jnpmInstance = jnpmInstancePair[0];
      var setJnpmInstance = jnpmInstancePair[1];
      var labelTickPair = React.useState(0); var setLabelTick = labelTickPair[1];
      function credentialValue(response) {
        if (!response || response.ok !== true) throw new Error(response && response.error && response.error.message ? response.error.message : "Credential operation failed");
        return response.value;
      }
      var credentialActions = {
        async describe(ref) {
          var value = credentialValue(await ctx.remote.credentials.describe([ref]));
          return value[ref];
        },
        async set(ref, value) {
          credentialValue(await ctx.remote.credentials.set(ref, value));
        },
        async unset(ref) {
          credentialValue(await ctx.remote.credentials.unset(ref));
        },
      };

      function resetDrafts(payload) {
        var next = {};
        for (var i = 0; i < (payload.sources || []).length; i += 1) {
          var source = payload.sources[i];
          next[source.sourceKey] = clone(source.config);
        }
        setDrafts(next);
      }
      var load = React.useCallback(async function () {
        setLoading(true); setError("");
        try {
          var payload = await request("/api/state");
          setData(payload);
          resetDrafts(payload);
        } catch (failure) {
          setError(t("loadFailed") + ": " + errorText(failure));
        } finally {
          setLoading(false);
        }
      }, []);
      React.useEffect(function () { load(); }, [load]);

      function updateField(sourceKey, key, value) {
        setDrafts(function (previous) {
          var next = Object.assign({}, previous);
          var base = previous[sourceKey] ? clone(previous[sourceKey]) : {};
          base[key] = value;
          next[sourceKey] = base;
          return next;
        });
        setMessages(function (previous) { var next = Object.assign({}, previous); delete next[sourceKey]; return next; });
      }
      function setSourceMessage(sourceKey, kind, text) {
        setMessages(function (previous) { var next = Object.assign({}, previous); next[sourceKey] = { kind: kind, text: text }; return next; });
      }
      async function save(source) {
        setSaving(source.sourceKey);
        setSourceMessage(source.sourceKey, "info", "");
        try {
          var result = await post("/api/config", {
            sourceKey: source.sourceKey,
            config: drafts[source.sourceKey] || source.config,
            expectedRevision: source.revision,
          });
          if (result.applyError) setSourceMessage(source.sourceKey, "error", t("applyWarning") + ": " + result.applyError);
          else setSourceMessage(source.sourceKey, "ok", t("saved"));
          await load();
        } catch (failure) {
          setSourceMessage(source.sourceKey, "error", (failure.code === "SETTINGS_REVISION_CONFLICT" ? t("revisionConflict") : t("saveFailed")) + ": " + errorText(failure));
        } finally {
          setSaving("");
        }
      }
      function revert(source) {
        setDrafts(function (previous) { var next = Object.assign({}, previous); next[source.sourceKey] = clone(source.config); return next; });
        setMessages(function (previous) { var next = Object.assign({}, previous); delete next[source.sourceKey]; return next; });
      }
      async function checkAuth(source) {
        setAuthBusy(source.sourceKey);
        try {
          var result = await post("/api/action", { sourceKey: source.sourceKey, action: source.settings.auth.action, input: {} });
          setAuthResults(function (previous) { var next = Object.assign({}, previous); next[source.sourceKey] = result.result; return next; });
        } catch (failure) {
          setSourceMessage(source.sourceKey, "error", t("authCheckFailed") + ": " + errorText(failure));
        } finally { setAuthBusy(""); }
      }
      async function loadLabels(source, field) {
        try {
          var result = await post("/api/action", { sourceKey: source.sourceKey, action: field.suggestionsAction, input: {} });
          rememberLabels(source.sourceKey, result.result.items || []);
          setLabelTick(function (previous) { return previous + 1; });
        } catch {
          // Names are a display enhancement; the picker reports real failures.
        }
      }
      async function openPicker(source, field) {
        var sourceDraft = drafts[source.sourceKey] || source.config;
        var selected = Array.isArray(sourceDraft[field.key]) ? sourceDraft[field.key].slice() : [];
        var context = { sourceKey: source.sourceKey, fieldKey: field.key, items: [], loading: true, error: "", query: "", hasMore: false, nextToken: "", selected: selected };
        var seq = ++PICKER_SEARCH_SEQ;
        setPicker(context);
        try {
          var result = await post("/api/action", { sourceKey: source.sourceKey, action: field.suggestionsAction, input: {} });
          if (seq !== PICKER_SEARCH_SEQ) return;
          rememberLabels(source.sourceKey, result.result.items || []);
          setPicker(Object.assign({}, context, { items: result.result.items || [], loading: false, hasMore: result.result.hasMore === true, nextToken: result.result.nextToken || "" }));
        } catch (failure) {
          if (seq !== PICKER_SEARCH_SEQ) return;
          setPicker(Object.assign({}, context, { loading: false, error: sourceText(picker.sourceKey, "pickerLoadFailed") + ": " + errorText(failure) }));
        }
      }
      async function searchPicker(query) {
        if (!picker) return;
        var source = (data.sources || []).find(function (entry) { return entry.sourceKey === picker.sourceKey; });
        var field = findField(source, picker.fieldKey);
        var context = picker;
        var seq = ++PICKER_SEARCH_SEQ;
        setPicker(function (previous) { return previous ? Object.assign({}, previous, { loading: true, error: "", query: query }) : previous; });
        try {
          var result = await post("/api/action", { sourceKey: context.sourceKey, action: field.suggestionsAction, input: { query: query } });
          if (seq !== PICKER_SEARCH_SEQ) return;
          rememberLabels(context.sourceKey, result.result.items || []);
          setPicker(function (previous) {
            if (!previous || previous.sourceKey !== context.sourceKey || previous.fieldKey !== context.fieldKey) return previous;
            return Object.assign({}, previous, { loading: false, items: result.result.items || [], query: query, hasMore: result.result.hasMore === true, nextToken: result.result.nextToken || "" });
          });
        } catch (failure) {
          if (seq !== PICKER_SEARCH_SEQ) return;
          setPicker(function (previous) {
            if (!previous) return previous;
            return Object.assign({}, previous, { loading: false, error: t("pickerSearchFailed") + ": " + errorText(failure), query: query });
          });
        }
      }
      async function loadMorePicker() {
        if (!picker || !picker.nextToken) return;
        var source = (data.sources || []).find(function (entry) { return entry.sourceKey === picker.sourceKey; });
        var field = findField(source, picker.fieldKey);
        var context = picker;
        var seq = ++PICKER_SEARCH_SEQ;
        setPicker(function (previous) { return previous ? Object.assign({}, previous, { loading: true, error: "" }) : previous; });
        try {
          var result = await post("/api/action", {
            sourceKey: context.sourceKey,
            action: field.suggestionsAction,
            input: { query: context.query || "", pageToken: context.nextToken },
          });
          if (seq !== PICKER_SEARCH_SEQ) return;
          rememberLabels(context.sourceKey, result.result.items || []);
          var existing = context.items.map(function (item) { return item.value; });
          var added = (result.result.items || []).filter(function (item) { return existing.indexOf(item.value) < 0; });
          setPicker(function (previous) {
            if (!previous || previous.sourceKey !== context.sourceKey || previous.fieldKey !== context.fieldKey) return previous;
            return Object.assign({}, previous, {
              loading: false,
              items: context.items.concat(added),
              hasMore: result.result.hasMore === true,
              nextToken: result.result.nextToken || "",
            });
          });
        } catch (failure) {
          if (seq !== PICKER_SEARCH_SEQ) return;
          setPicker(function (previous) { return previous ? Object.assign({}, previous, { loading: false, error: t("pickerSearchFailed") + ": " + errorText(failure) }) : previous; });
        }
      }
      function applyPicker(next) {
        if (!picker) return;
        updateField(picker.sourceKey, picker.fieldKey, Array.isArray(next) ? next : []);
        closePicker();
      }
      function closePicker() {
        PICKER_SEARCH_SEQ += 1;
        setPicker(null);
      }
      function findField(source, key) {
        for (var i = 0; i < (source.settings.groups || []).length; i += 1) {
          var fields = source.settings.groups[i].fields || [];
          for (var j = 0; j < fields.length; j += 1) if (fields[j].key === key) return fields[j];
        }
        return { suggestionsAction: "listChats" };
      }

      if (loading && !data) return h("div", { className: "amb-page" }, h("div", { className: "amb-skeleton" }, t("loading")));
      if (error && !data) return h("div", { className: "amb-page" }, h("div", { className: "amb-error" }, error), h("button", { type: "button", className: "amb-btn", onClick: load }, t("refresh")));
      var sources = data && data.sources ? data.sources : [];
      var overview = data && data.overview ? data.overview : {};
      var pending = overview.deliveryStates ? (overview.deliveryStates.queued || 0) + (overview.deliveryStates.deferred || 0) : 0;
      var jnpmSources = sources.filter(function (source) { return source.sourceId === "jnpm"; });
      var otherSources = sources.filter(function (source) { return source.sourceId !== "jnpm"; });
      var selectedJnpm = jnpmSources.find(function (source) { return source.instance === jnpmInstance; }) || jnpmSources[0];
      var visibleSourceCount = otherSources.length + (jnpmSources.length ? 1 : 0);
      function renderSourceCard(source) {
        var draft = drafts[source.sourceKey] || clone(source.config);
        return h(SourceCard, {
          key: source.sourceKey,
          source: source,
          draft: draft,
          saving: saving === source.sourceKey,
          message: messages[source.sourceKey],
          authResult: authResults[source.sourceKey],
          authBusy: authBusy === source.sourceKey,
          picker: picker,
          credentialActions: credentialActions,
          onField: function (key, value) { updateField(source.sourceKey, key, value); },
          onSave: function () { save(source); },
          onRevert: function () { revert(source); },
          onAuth: function () { checkAuth(source); },
          onSuggest: function (field) { openPicker(source, field); },
          onLoadLabels: loadLabels,
          onPickerClose: closePicker,
          onPickerSearch: searchPicker,
          onPickerLoadMore: loadMorePicker,
          onPickerApply: applyPicker,
        });
      }
      return h("div", { className: "amb-page" },
        h("header", { className: "amb-head" },
          h("div", { className: "amb-head-main" },
            h("h2", { className: "amb-title" }, t("title")),
            h("p", { className: "amb-sub" }, t("subtitle"))
          ),
          h("button", { type: "button", className: "amb-btn", disabled: loading, onClick: load }, loading ? t("refreshing") : t("refresh"))
        ),
        h("div", { className: "amb-overview" },
          h("span", { className: "amb-stat" }, t("overviewMails") + " ", h("b", null, overview.mails || 0)),
          h("span", { className: "amb-stat" }, t("overviewPending") + " ", h("b", null, pending)),
          h("span", { className: "amb-stat" }, t("overviewSubscriptions") + " ", h("b", null, overview.subscriptions || 0)),
          h("span", { className: "amb-footer-status" }, visibleSourceCount + " " + t("sourceCount"))
        ),
        h("div", { className: "amb-note" }, h("span", { "aria-hidden": "true" }, "!"), h("span", null, t("security") + " " + t("localOnly"))),
        error ? h("div", { className: "amb-error" }, error) : null,
        !sources.length ? h("div", { className: "amb-card" }, h("div", { className: "amb-skeleton" }, h("div", { style: { fontWeight: 600, marginBottom: "4px" } }, t("noSources")), h("div", null, t("noSourcesHint")))) : null,
        otherSources.map(renderSourceCard),
        selectedJnpm ? h("div", { className: "amb-jnpm-group", key: "jnpm-group" },
          h("div", { className: "amb-jnpm-selector" },
            h("span", { className: "amb-group-title" }, t("jnpmGroupTitle")),
            h("span", { className: "amb-spacer" }),
            h("label", { className: "amb-hint" }, t("jnpmEnvironment")),
            h("select", {
              className: "amb-select",
              value: selectedJnpm.instance,
              onChange: function (event) { setJnpmInstance(event.target.value); },
            }, jnpmSources.map(function (source) {
              return h("option", { key: source.sourceKey, value: source.instance }, source.displayName || source.instance);
            }))
          ),
          renderSourceCard(selectedJnpm)
        ) : null
      );
    }

    function apply(ctx) {
      activeCtx = ctx;
      t = ctx.locale.bind("agent-mailbox-settings");
      ctx.effect(function () { return ctx.locale.register("agent-mailbox-settings", "zh", ZH); }, "agent-mailbox zh locale");
      ctx.effect(function () { return ctx.locale.register("agent-mailbox-settings", "en", EN); }, "agent-mailbox en locale");
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({ name: "settings.section", id: "agent-mailbox", order: 18, label: function () { return t("title"); } }, function () {
          return h("div", null, h("style", { "data-agent-mailbox-settings": "styles" }, CSS), h(SectionView, { ctx: ctx }));
        });
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "remote", "remote.credentials"];
    return module.exports;
  }
});
