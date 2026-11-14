# Astro Starter Kit: Blog

```sh
npm create astro@latest -- --template blog
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and Open Graph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).

## Pages CMS 写作后台

访问 [Pages CMS](https://app.pagescms.org/) 并使用 GitHub 登录，选择 `ljin-blog` 仓库和 `main` 分支，然后进入“博客文章”集合。

新建文章时，将创建时显示的文件名填写为英文小写 slug，例如 `my-first-post`，Pages CMS 会生成 `src/content/blog/my-first-post.md`。填写标题、摘要、发布日期、可选更新日期和正文后保存；保存会提交到 GitHub，`main` 分支更新后由 Cloudflare 自动构建并部署到 `https://ljin.top`。

封面图片通过“封面图片”字段上传，会保存到 `src/assets`，文章 frontmatter 中写入类似 `../../assets/cover.jpg` 的路径。正文编辑器中插入的图片会保存到 `public/images/blog`，Markdown 中写入类似 `/images/blog/example.jpg` 的路径。

## 私密文章和评论

- 从博客页脚进入「私密文章」，用站主密码登录，即可创建、查看、编辑和删除私密文章。编辑器支持 Markdown 正文。私密文章保存在 Cloudflare D1，仅登录的站主可见。
- 所有公开文章都开放评论。访客可直接留言，昵称选填。评论发表后立即公开，按最新到最旧分页显示。站主可以在 Cloudflare D1 控制台的 `comments` 表按评论 ID 删除留言。
- Pages CMS 继续用于公开发布。若要将已发表文章移出公开网站，可在私密区保存正文，再删掉 Pages CMS 中的公开版本。曾提交到公开仓库的正文或图片仍可能从 Git 历史、旧部署和已有副本中访问。

### Cloudflare 部署

1. 创建 D1 数据库，例如 `npx wrangler d1 create ljin-blog-content`。在 `wrangler.jsonc` 的 `BLOG_DB` 绑定中填入该数据库的 `database_name` 和 `database_id`。首次部署前执行 `npx wrangler d1 migrations apply BLOG_DB --remote`。
2. 在 `ljin-blog` Worker 的「Settings → Variables and Secrets」中添加 Secret `BLOG_OWNER_PASSWORD`。用密码管理器生成至少 32 字符的随机密码。这个密码用于站主登录，修改后已有会话会失效。
3. 按现有 Cloudflare Workers 部署流程发布。部署后打开站点页脚的「私密文章」以及任意公开文章的评论区。

本地可在 `.dev.vars` 设置测试专用的 `BLOG_OWNER_PASSWORD`，执行 `npm run build`、`npx wrangler d1 migrations apply BLOG_DB --local` 和 `npx wrangler dev`。通过 Wrangler 打开的页面才能访问本地数据库和评论接口。
