<script>
	import { state as store, currentUser, loadData, isLoggedIn, setTheme } from './utils/store.js'

	export default {
		onLaunch() {
			const user = currentUser()
			if (isLoggedIn() && user) {
				store.user = user
				setTheme(user.theme)
				loadData()
			}
		},
		onShow() {},
		onHide() {}
	}
</script>

<style>
	/* ==========================================================================
	   全局样式 — 迁移自 003.前端代码/assets/css（tokens / base / components）
	   单位统一使用 rpx，适配 750 设计稿
	   ========================================================================== */

	page {
		background: #faf8fd;
		font-family: -apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
		color: #221e2e;
		font-size: 28rpx;
		-webkit-font-smoothing: antialiased;
	}

	/* ------------------------------ 主题令牌 ------------------------------ */
	.theme-macaron {
		--brand: #a78bfa;
		--brand-strong: #6e56b8;
		--brand-soft: #ede7fb;
		--brand-mist: #f4f0fe;
		--bg: #faf8fd;
		--surface: #ffffff;
		--surface-2: #f5f1fc;
		--border: #e8e2f4;
		--text: #221e2e;
		--text-2: #57516b;
		--text-3: #8b849d;
	}

	.theme-ocean {
		--brand: #8fbce8;
		--brand-strong: #2c6a9e;
		--brand-soft: #e3f0fa;
		--brand-mist: #f0f7fd;
		--bg: #f7fafd;
		--surface: #ffffff;
		--surface-2: #eef6fc;
		--border: #dce9f5;
		--text: #1b2634;
		--text-2: #4c5c6e;
		--text-3: #7e8c9c;
	}

	.theme-mint {
		--brand: #86cfb8;
		--brand-strong: #2a7561;
		--brand-soft: #e1f3ec;
		--brand-mist: #f0faf6;
		--bg: #f6fbf9;
		--surface: #ffffff;
		--surface-2: #edf8f3;
		--border: #d9eee5;
		--text: #182a25;
		--text-2: #49645b;
		--text-3: #7c948c;
	}

	.theme-apricot {
		--brand: #f0b58c;
		--brand-strong: #9b5527;
		--brand-soft: #fbeadd;
		--brand-mist: #fdf5ee;
		--bg: #fdf9f5;
		--surface: #ffffff;
		--surface-2: #fcf2e9;
		--border: #f3e3d5;
		--text: #2c211a;
		--text-2: #6a574a;
		--text-3: #99887b;
	}

	/* ------------------------------ 页面骨架 ------------------------------ */
	.page {
		min-height: 100vh;
		background: var(--bg, #faf8fd);
		color: var(--text, #221e2e);
		padding-bottom: 48rpx;
	}

	.container {
		padding: 0 32rpx;
	}

	/* 顶部栏：状态栏占位 + 标题 + 头像；吸顶固定，不随页面滚动 */
	.appbar {
		position: sticky;
		top: 0;
		z-index: 30;
		background: var(--bg);
		padding: calc(var(--status-bar-height) + 20rpx) 32rpx 20rpx;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.appbar__title {
		font-size: 40rpx;
		font-weight: 700;
		letter-spacing: 0.5rpx;
	}

	.appbar__sub {
		margin-top: 6rpx;
		font-size: 24rpx;
		color: var(--text-3);
	}

	.avatar {
		width: 76rpx;
		height: 76rpx;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 32rpx;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ------------------------------ 卡片 ------------------------------ */
	.card {
		background: var(--surface);
		border: 1rpx solid var(--border);
		border-radius: 32rpx;
		padding: 32rpx;
		margin-bottom: 24rpx;
		box-shadow: 0 4rpx 20rpx rgba(110, 86, 184, 0.06);
	}

	.card--flat {
		box-shadow: none;
	}

	.card__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24rpx;
	}

	.card__title {
		font-size: 30rpx;
		font-weight: 700;
	}

	.card__desc {
		font-size: 24rpx;
		color: var(--text-3);
	}

	/* ------------------------------ 文本 ------------------------------ */
	.muted {
		color: var(--text-3);
	}

	.strong {
		font-weight: 700;
	}

	.small {
		font-size: 24rpx;
	}

	.mono {
		font-variant-numeric: tabular-nums;
	}

	.expense {
		color: #2e2a3b;
	}

	.income {
		color: #2f7d64;
	}

	.danger {
		color: #b23a48;
	}

	.money {
		font-size: 44rpx;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	/* ------------------------------ 按钮 ------------------------------ */
	.btn {
		height: 88rpx;
		line-height: 88rpx;
		border-radius: 999rpx;
		text-align: center;
		font-size: 30rpx;
		font-weight: 600;
		background: var(--surface-2);
		color: var(--text-2);
		border: 1rpx solid var(--border);
	}

	.btn--primary {
		background: var(--brand);
		color: #fff;
		border-color: transparent;
	}

	.btn--soft {
		background: var(--brand-soft);
		color: var(--brand-strong);
		border-color: transparent;
	}

	.btn--ghost {
		background: transparent;
		border-color: var(--border);
		color: var(--text-2);
	}

	.btn--danger {
		background: #fdecee;
		color: #b23a48;
		border-color: transparent;
	}

	.btn--sm {
		height: 64rpx;
		line-height: 64rpx;
		padding: 0 28rpx;
		font-size: 26rpx;
	}

	.btn[disabled] {
		opacity: 0.55;
	}

	/* ------------------------------ 表单 ------------------------------ */
	.field {
		display: block;
		margin-bottom: 24rpx;
	}

	.field__label {
		display: block;
		font-size: 24rpx;
		color: var(--text-3);
		margin-bottom: 12rpx;
	}

	.input {
		height: 88rpx;
		padding: 0 28rpx;
		border-radius: 24rpx;
		background: var(--surface-2);
		border: 1rpx solid var(--border);
		font-size: 28rpx;
		color: var(--text);
	}

	.input--plain {
		background: var(--surface);
	}

	.row-in-row {
		display: flex;
		align-items: center;
	}

	.row-in-row .input {
		flex: 1;
		margin-right: 16rpx;
	}

	/* ------------------------------ 列表 ------------------------------ */
	.list {
		background: var(--surface);
		border-radius: 32rpx;
		border: 1rpx solid var(--border);
		overflow: hidden;
	}

	.list__row {
		display: flex;
		align-items: center;
		padding: 28rpx 32rpx;
		border-bottom: 1rpx solid var(--border);
	}

	.list__row:last-child {
		border-bottom: none;
	}

	.row__main {
		flex: 1;
		min-width: 0;
	}

	.row__title {
		font-size: 28rpx;
		font-weight: 600;
	}

	.row__sub {
		font-size: 22rpx;
		color: var(--text-3);
		margin-top: 6rpx;
	}

	/* ------------------------------ 分类圆标 ------------------------------ */
	.cat-icon {
		width: 64rpx;
		height: 64rpx;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32rpx;
		margin-right: 20rpx;
	}

	/* ------------------------------ 空态 ------------------------------ */
	.empty {
		padding: 72rpx 24rpx;
		text-align: center;
		color: var(--text-3);
		font-size: 26rpx;
	}

	/* ------------------------------ 分段控件 ------------------------------ */
	.segment {
		display: flex;
		background: var(--surface-2);
		border-radius: 999rpx;
		padding: 6rpx;
	}

	.segment__item {
		flex: 1;
		text-align: center;
		height: 64rpx;
		line-height: 64rpx;
		border-radius: 999rpx;
		font-size: 26rpx;
		color: var(--text-3);
	}

	.segment__item.is-active {
		background: var(--surface);
		color: var(--brand-strong);
		font-weight: 700;
		box-shadow: 0 2rpx 10rpx rgba(110, 86, 184, 0.12);
	}

	/* ------------------------------ 进度条 ------------------------------ */
	.progress {
		height: 16rpx;
		border-radius: 999rpx;
		background: var(--surface-2);
		overflow: hidden;
	}

	.progress__bar {
		height: 100%;
		border-radius: 999rpx;
		background: var(--brand);
	}

	/* ------------------------------ 徽标 ------------------------------ */
	.tag {
		display: inline-block;
		padding: 4rpx 14rpx;
		border-radius: 999rpx;
		font-size: 20rpx;
		background: var(--brand-soft);
		color: var(--brand-strong);
	}
</style>
