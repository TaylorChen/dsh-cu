window.__ModuleLoader__.load({
	id: "dsh-cu",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/**
		* Client-side locales for the `cu` settings card (zh/en).
		* @module @cu/dsh-cu/client/locales
		*/
		/** Locale namespace. */
		const NS = "cu.settings";
		const zh = {
			desc: "Computer Use：通过辅助功能树操作桌面应用，写操作先经你确认",
			unsaved: "未保存",
			save: "保存",
			discard: "放弃修改",
			failed: "保存失败，请检查后重试",
			overridden: "已覆盖",
			reset: "重置",
			invalid: "无效",
			groupApproval: "审批",
			groupApps: "应用与输入",
			groupAudit: "记录",
			policy: "审批策略",
			policyAsk: "每次写操作前确认（推荐）",
			policySession: "会话内免重复确认",
			apps: "允许的应用",
			appsHint: "逗号分隔，如 微信,钉钉；留空不限制",
			inputMode: "输入模式",
			inputModeSemantic: "语义操作（推荐）",
			inputModeSemanticHint: "直接调用辅助功能动作，不动鼠标不抢焦点",
			inputModeHeaded: "物理输入",
			inputModeHeadedHint: "移动真实鼠标键盘，仅在应用拒绝语义操作时需要",
			audit: "审计日志",
			auditHint: "写操作记入 ~/.dsh/cu/audit.jsonl（只记目标，不记内容）",
			guard: "危险应用拦截",
			guardHint: "拒绝操作系统设置、钥匙串、终端等"
		};
		const en = {
			desc: "Computer Use: operate desktop apps via the accessibility tree; writes ask first",
			unsaved: "Unsaved",
			save: "Save",
			discard: "Discard",
			failed: "Save failed, please review and retry",
			overridden: "Overridden",
			reset: "Reset",
			invalid: "Invalid",
			groupApproval: "Approval",
			groupApps: "Apps & input",
			groupAudit: "Records",
			policy: "Approval policy",
			policyAsk: "Confirm every write (recommended)",
			policySession: "Allow once per session",
			apps: "Allowed apps",
			appsHint: "Comma separated, e.g. Safari,Notes; empty = no limit",
			inputMode: "Input mode",
			inputModeSemantic: "Semantic actions (recommended)",
			inputModeSemanticHint: "Accessibility actions only; no pointer movement or focus stealing",
			inputModeHeaded: "Physical input",
			inputModeHeadedHint: "Move the real pointer/keyboard; needed only when an app refuses semantic actions",
			audit: "Audit log",
			auditHint: "Writes go to ~/.dsh/cu/audit.jsonl (targets only, never content)",
			guard: "Dangerous-app guard",
			guardHint: "Refuse System Settings, Keychain, Terminal, …"
		};
		//#endregion
		//#region src/client/index.ts
		/** 只依赖 slots / locale（shell 必备）；配置表单服务按需自取。 */
		const inject = ["slots", "locale"];
		/** 卡片可控字段。 */
		const FIELDS = [
			"approvalPolicy",
			"allowedApps",
			"inputMode",
			"auditEnabled",
			"guardDangerous"
		];
		/** 基于 configForms 控制器的扁平表单（写穿 + 读回）。 */
		var CuFormController = class {
			scope;
			staged = /* @__PURE__ */ new Map();
			saving = false;
			failed = false;
			listeners = /* @__PURE__ */ new Set();
			cached = null;
			constructor(scope) {
				this.scope = scope;
				scope.subscribe(() => this.publish());
			}
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			getSnapshot = () => {
				if (this.cached === null) this.cached = this.build();
				return this.cached;
			};
			isReady() {
				return this.scope.getSnapshot().status === "ready";
			}
			publish() {
				this.cached = null;
				for (const listener of this.listeners) listener();
			}
			build() {
				const snapshot = this.scope.getSnapshot();
				const value = snapshot.value ?? {};
				const fields = {};
				for (const field of FIELDS) {
					const staged = this.staged.get(field);
					if (staged === void 0) {
						const current = value[field];
						fields[field] = { value: current === void 0 ? "" : current };
						continue;
					}
					fields[field] = { value: staged.value };
				}
				return {
					shell: {
						available: snapshot.status === "ready",
						writable: snapshot.writable !== false,
						dirty: this.staged.size > 0,
						saving: this.saving,
						failed: this.failed
					},
					fields
				};
			}
			editText(field, text) {
				this.staged.set(field, { value: text });
				this.publish();
			}
			stageValue(field, value) {
				this.staged.set(field, { value });
				this.publish();
			}
			discard() {
				if (this.staged.size === 0 && !this.failed) return;
				this.staged.clear();
				this.failed = false;
				this.publish();
			}
			async save() {
				const current = this.scope.getSnapshot().value ?? {};
				const writes = [];
				for (const [field, staged] of this.staged) {
					if (typeof staged.value === "boolean") {
						if (current[field] !== staged.value) writes.push(() => this.scope.set(field, staged.value));
						continue;
					}
					const text = typeof staged.value === "string" ? staged.value.trim() : "";
					if (text === "") {
						if (current[field] !== void 0 && current[field] !== "") writes.push(() => this.scope.unset(field));
						continue;
					}
					if (text === String(current[field] ?? "")) continue;
					writes.push(() => this.scope.set(field, text));
				}
				if (writes.length === 0 || this.saving) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const write of writes) try {
					await write();
				} catch {
					landed = false;
				}
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
		};
		const css = `
.cu-tab{box-sizing:border-box;max-width:760px;padding:4px 0 24px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.cu-tab h3{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-0.01em}
.cu-tab-desc{margin:0 0 18px;color:var(--dsw-alias-label-tertiary);font-size:13px}
.cu-tab-sec{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:14px 16px;margin-bottom:14px}
.cu-tab-legend{margin:0 0 10px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}
.cu-tab-row{display:flex;align-items:flex-start;gap:10px;padding:5px 0}
.cu-tab-label{flex:none;width:96px;padding-top:2px;color:var(--dsw-alias-label-primary);font-size:13px}
.cu-tab-options{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.cu-tab-option{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.cu-tab-option input{accent-color:var(--dsw-alias-brand-primary);margin:2px 0 0}
.cu-tab-option b{font-weight:500;color:var(--dsw-alias-label-primary)}
.cu-tab-hint{display:block;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}
.cu-tab-input{flex:1;min-width:0;box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;font-size:13px;line-height:20px}
.cu-tab-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.cu-tab-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding-top:4px}
.cu-tab-failed{flex:1;margin:0;color:var(--dsw-alias-label-error);font-size:12px}
.cu-tab-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.cu-tab-btn:disabled{opacity:.4;cursor:default}
.cu-tab-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.cu-tab-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.cu-tab-fallback{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:16px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}
.cu-tab-pending{margin-left:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500}
`;
		const tagId = "dsh-cu/CuTab.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cu";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		function RadioOption(props) {
			const { name, value, checked, disabled, title, hint, onPick } = props;
			return (0, react_jsx_runtime.jsx)("label", {
				className: "cu-tab-option",
				children: [(0, react_jsx_runtime.jsx)("input", {
					type: "radio",
					name,
					value,
					checked,
					disabled,
					onChange: onPick
				}), (0, react_jsx_runtime.jsx)("span", { children: [(0, react_jsx_runtime.jsx)("b", { children: title }), hint ? (0, react_jsx_runtime.jsx)("span", {
					className: "cu-tab-hint",
					children: hint
				}) : null] })]
			});
		}
		function CheckRow(props) {
			const { field, checked, disabled, title, hint, onToggle } = props;
			return (0, react_jsx_runtime.jsx)("label", {
				className: "cu-tab-option",
				htmlFor: `cu-field-${field}`,
				children: [(0, react_jsx_runtime.jsx)("input", {
					id: `cu-field-${field}`,
					type: "checkbox",
					checked,
					disabled,
					onChange: (event) => onToggle(event.target.checked)
				}), (0, react_jsx_runtime.jsx)("span", { children: [(0, react_jsx_runtime.jsx)("b", { children: title }), (0, react_jsx_runtime.jsx)("span", {
					className: "cu-tab-hint",
					children: hint
				})] })]
			});
		}
		function CuTab(props) {
			const { controller, t } = props;
			if (controller === void 0) return (0, react_jsx_runtime.jsx)("div", {
				className: "cu-tab",
				children: (0, react_jsx_runtime.jsx)("div", {
					className: "cu-tab-fallback",
					children: [
						(0, react_jsx_runtime.jsx)("h3", { children: "Computer Use" }),
						(0, react_jsx_runtime.jsx)("p", { children: t("desc") }),
						(0, react_jsx_runtime.jsx)("p", { children: "当前客户端未提供配置表单服务（configForms），因此这里不能编辑配置。插件本体不受影响：在会话里运行 cu_doctor 可查看引擎与权限状态，配置可通过环境变量 CU_APPROVAL / CU_BIN 调整。" })
					]
				})
			});
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
			const { available, writable, dirty, saving, failed } = snapshot.shell;
			if (!available) return (0, react_jsx_runtime.jsx)("div", {
				className: "cu-tab",
				children: (0, react_jsx_runtime.jsx)("div", {
					className: "cu-tab-fallback",
					children: [
						(0, react_jsx_runtime.jsx)("h3", { children: "Computer Use" }),
						(0, react_jsx_runtime.jsx)("p", { children: t("desc") }),
						(0, react_jsx_runtime.jsx)("p", { children: "设置命名空间尚未就绪（Host 未暴露 dsh-cu 条目）。插件工具在会话中仍然可用。" })
					]
				})
			});
			const disabled = !writable || saving;
			const policy = snapshot.fields.approvalPolicy;
			const mode = snapshot.fields.inputMode;
			return (0, react_jsx_runtime.jsx)("div", {
				className: "cu-tab",
				children: [
					(0, react_jsx_runtime.jsx)("h3", { children: ["Computer Use", dirty ? (0, react_jsx_runtime.jsx)("span", {
						className: "cu-tab-pending",
						children: t("unsaved")
					}) : null] }),
					(0, react_jsx_runtime.jsx)("p", {
						className: "cu-tab-desc",
						children: t("desc")
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "cu-tab-sec",
						children: [(0, react_jsx_runtime.jsx)("p", {
							className: "cu-tab-legend",
							children: t("groupApproval")
						}), (0, react_jsx_runtime.jsx)("div", {
							className: "cu-tab-row",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "cu-tab-label",
								children: t("policy")
							}), (0, react_jsx_runtime.jsx)("div", {
								className: "cu-tab-options",
								children: [(0, react_jsx_runtime.jsx)(RadioOption, {
									key: "ask",
									name: "cu-policy",
									value: "ask",
									checked: policy.value !== "session",
									disabled,
									title: t("policyAsk"),
									hint: "",
									onPick: () => controller.stageValue("approvalPolicy", "ask")
								}), (0, react_jsx_runtime.jsx)(RadioOption, {
									key: "session",
									name: "cu-policy",
									value: "session",
									checked: policy.value === "session",
									disabled,
									title: t("policySession"),
									hint: "",
									onPick: () => controller.stageValue("approvalPolicy", "session")
								})]
							})]
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "cu-tab-sec",
						children: [
							(0, react_jsx_runtime.jsx)("p", {
								className: "cu-tab-legend",
								children: t("groupApps")
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: "cu-tab-row",
								children: [(0, react_jsx_runtime.jsx)("label", {
									className: "cu-tab-label",
									htmlFor: "cu-field-allowedApps",
									children: t("apps")
								}), (0, react_jsx_runtime.jsx)("input", {
									id: "cu-field-allowedApps",
									className: "cu-tab-input",
									type: "text",
									value: String(snapshot.fields.allowedApps.value ?? ""),
									placeholder: t("appsHint"),
									disabled,
									onChange: (event) => controller.editText("allowedApps", event.target.value)
								})]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: "cu-tab-row",
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: "cu-tab-label",
									children: t("inputMode")
								}), (0, react_jsx_runtime.jsx)("div", {
									className: "cu-tab-options",
									children: [(0, react_jsx_runtime.jsx)(RadioOption, {
										key: "semantic",
										name: "cu-mode",
										value: "semantic",
										checked: mode.value !== "headed",
										disabled,
										title: t("inputModeSemantic"),
										hint: t("inputModeSemanticHint"),
										onPick: () => controller.stageValue("inputMode", "semantic")
									}), (0, react_jsx_runtime.jsx)(RadioOption, {
										key: "headed",
										name: "cu-mode",
										value: "headed",
										checked: mode.value === "headed",
										disabled,
										title: t("inputModeHeaded"),
										hint: t("inputModeHeadedHint"),
										onPick: () => controller.stageValue("inputMode", "headed")
									})]
								})]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "cu-tab-sec",
						children: [
							(0, react_jsx_runtime.jsx)("p", {
								className: "cu-tab-legend",
								children: t("groupAudit")
							}),
							(0, react_jsx_runtime.jsx)(CheckRow, {
								field: "auditEnabled",
								checked: snapshot.fields.auditEnabled.value === true,
								disabled,
								title: t("audit"),
								hint: t("auditHint"),
								onToggle: (next) => controller.stageValue("auditEnabled", next)
							}),
							(0, react_jsx_runtime.jsx)(CheckRow, {
								field: "guardDangerous",
								checked: snapshot.fields.guardDangerous.value === true,
								disabled,
								title: t("guard"),
								hint: t("guardHint"),
								onToggle: (next) => controller.stageValue("guardDangerous", next)
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "cu-tab-footer",
						children: [
							failed ? (0, react_jsx_runtime.jsx)("p", {
								className: "cu-tab-failed",
								children: t("failed")
							}) : null,
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cu-tab-btn cu-tab-discard",
								disabled: !dirty || saving,
								onClick: () => controller.discard(),
								children: t("discard")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cu-tab-btn cu-tab-save",
								disabled: !dirty || saving,
								onClick: () => {
									controller.save();
								},
								children: t("save")
							})
						]
					})
				]
			});
		}
		const BAR_CSS = `
.cu-bar{display:flex;align-items:center;gap:12px;background:var(--dsw-alias-label-primary,#1b1a17);color:var(--dsw-alias-bg-layer-3,#f6f4ef);border-radius:12px;padding:9px 12px;font-size:12px;line-height:1.4;box-shadow:0 6px 20px rgba(0,0,0,.18);margin:0 0 8px}
.cu-bar-dot{width:7px;height:7px;border-radius:50%;background:#e5484d;flex:none;animation:cublink 1.2s ease-in-out infinite}
@keyframes cublink{0%,100%{opacity:1}50%{opacity:.35}}
.cu-bar-dot.paused{background:#f2a33c;animation:none}
.cu-bar-title{font-weight:600;white-space:nowrap}
.cu-bar-meta{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cu-bar-btns{margin-left:auto;display:flex;gap:6px;flex:none}
.cu-bar-btn{appearance:none;font:inherit;font-size:11px;padding:4px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:inherit;cursor:pointer;white-space:nowrap}
.cu-bar-btn:hover{background:rgba(255,255,255,.16)}
.cu-bar-btn.stop{border-color:rgba(255,255,255,.6);background:rgba(255,255,255,.14);font-weight:600}
.cu-bar-recent{opacity:.72;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"dsh-cu/CuBar.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cu";
			tag.dataset.pluginCss = "dsh-cu/CuBar.css";
			tag.textContent = BAR_CSS;
			document.head.appendChild(tag);
		}
		function formatMs(ms) {
			const total = Math.max(0, Math.round(ms / 1e3));
			return total >= 60 ? `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s` : `${total}s`;
		}
		/** 轮询 /api/cu/status；路由行缺席时 online=false。 */
		function useCuStatus() {
			const [state, setState] = (0, react.useState)({
				snap: void 0,
				online: false
			});
			(0, react.useEffect)(() => {
				let stopped = false;
				const tick = async () => {
					try {
						const res = await fetch("/api/cu/status", { cache: "no-store" });
						if (!res.ok) throw new Error(String(res.status));
						const snap = await res.json();
						if (!stopped) setState({
							snap,
							online: true
						});
					} catch {
						if (!stopped) setState((prev) => prev.online ? {
							snap: prev.snap,
							online: false
						} : prev);
					}
				};
				tick();
				const timer = setInterval(() => {
					tick();
				}, 1e3);
				return () => {
					stopped = true;
					clearInterval(timer);
				};
			}, []);
			return state;
		}
		async function postCu(path) {
			try {
				await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}"
				});
			} catch {}
		}
		/** 运行控制浮条：agent 操作桌面时的实时状态与紧急控制。 */
		function CuStatusBarDock() {
			const { snap, online } = useCuStatus();
			if (!online || snap === void 0) return null;
			const current = snap.current;
			const paused = snap.pausedForMs > 0;
			const last = snap.ops[snap.ops.length - 1];
			const lastAge = last ? Date.now() - Date.parse(last.ts) : Number.POSITIVE_INFINITY;
			if (!current && !paused && lastAge > 2e4) return null;
			const recent = snap.ops.slice(-3).reverse().map((op) => `${op.tool.replace(/^cu_/, "")}${op.status === "aborted" ? "·停" : op.ok ? "" : "·败"} ${formatMs(op.ms)}`).join("  ");
			return (0, react_jsx_runtime.jsx)("div", {
				className: "cu-bar",
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: `cu-bar-dot${paused ? " paused" : ""}`,
						"aria-hidden": "true"
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: "cu-bar-title",
						children: paused ? "已暂停" : "正在操作桌面"
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: "cu-bar-meta",
						children: current ? `${current.app ?? "当前桌面"} · ${current.tool.replace(/^cu_/, "")}${current.ref ? ` · ${current.ref}` : ""} · ${formatMs(snap.currentElapsedMs)}` : recent || "等待操作"
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: "cu-bar-recent",
						children: current && recent ? `上次：${recent}` : ""
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: "cu-bar-btns",
						children: paused ? (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cu-bar-btn",
							onClick: () => {
								postCu("/api/cu/resume");
							},
							children: "恢复"
						}) : [(0, react_jsx_runtime.jsx)("button", {
							key: "pause",
							type: "button",
							className: "cu-bar-btn",
							title: "暂停 60 秒：期间拒绝新的写操作",
							onClick: () => {
								postCu("/api/cu/stop");
							},
							children: "暂停"
						}), (0, react_jsx_runtime.jsx)("button", {
							key: "stop",
							type: "button",
							className: "cu-bar-btn stop",
							title: "中断当前操作，并暂停 60 秒",
							onClick: () => {
								postCu("/api/cu/stop");
							},
							children: "停止"
						})]
					})
				]
			});
		}
		/**
		* 客户端插件入口：注册文案 + 挂设置页签 + 挂运行控制浮条。
		* @param ctx - 客户端根上下文。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "cu-settings: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "dsh-cu-bar",
				order: 10
			}, CuStatusBarDock));
			const configForms = ctx.get?.("configForms");
			let controller;
			try {
				if (configForms && typeof configForms.get === "function") controller = new CuFormController(configForms.get("dsh-cu"));
			} catch {
				controller = void 0;
			}
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "dsh-cu",
				order: 50,
				label: () => "Computer Use",
				inject: () => ({
					controller,
					t
				})
			}, CuTab));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map