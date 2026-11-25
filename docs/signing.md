# APK 签名与信任（新手向）

## 为什么会有“签名不受信任”

OpenWrt 25.12 使用 apk 包管理。安装时它默认做两件事：

1. 检查包里的签名；
2. 找签名对应的**公钥**是否在 `/etc/apk/keys/` 里。

两者对不上就报：

```
ERROR: UNTRUSTED signature
```

这时只有两种选择：`apk add --allow-untrusted`（本次放行），或者先把公钥装进路由器
（长期信任）。

签名能保证：

- **完整性**：包在传输/存放过程中没有被改过；
- **来源**：这个包确实由持有对应私钥的人打出来的。

它**不是杀毒**，不代表包一定安全。仍然只应安装你信任的人打的包。

---

## 三种做法，按省事程度排序

| 做法 | 适合谁 | 代价 |
|---|---|---|
| 不签名，安装时加 `--allow-untrusted` | 偶尔装一次 | 每次都要加参数，或先跑解锁脚本 |
| **自己生成密钥并签名**，公钥装进路由器 | 经常自己打包 | 一次性设置，之后直接 `apk add` |
| 用路由器已信任的密钥签 | 自己编译 OpenWrt 的人 | 需要那棵构建树的私钥 |

> 官方 OpenWrt 的签名私钥不会公开，所以普通人拿不到；但你可以让路由器**多信任一把
> 你自己的钥匙**，两者不冲突。

---

## 方案一：不签名（最省事）

```sh
apk add --allow-untrusted ./luci-app-adguardhome-2.0.0-r3.apk
```

或者先跑一次解锁脚本（全局允许未信任包），之后就能直接 `apk add`：

```sh
wget -O toggle.sh https://cafe.cpolar.cn/wkdaily/cool/raw/branch/master/apk-untrusted-toggle.sh && sh toggle.sh
```

---

## 方案二：自己签名（推荐）

### 1. 生成密钥对

在**电脑上**做（Windows 的 Git Bash、Linux、macOS 都自带 `openssl`）。
路由器通常没装 openssl，不建议在路由器上生成。

```sh
mkdir -p ~/agh-sign && cd ~/agh-sign

# 私钥：只留在自己手里
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem

# 公钥：要装到路由器
openssl ec -in private-key.pem -pubout -out public-key.pem
```

得到两个文件：

- `private-key.pem` —— **私钥，绝不能提交到仓库、发群、上传网盘**；
- `public-key.pem` —— 公钥，可以公开。

### 2. 用私钥打包

在打包命令里加 `--sign`（完整打包步骤见 [build-apk.md](build-apk.md)）：

```sh
apk mkpkg \
  --info "name:luci-app-adguardhome" \
  --info "version:2.0.0-r3" \
  --info "arch:noarch" \
  ... \
  --files ./root \
  --sign ~/agh-sign/private-key.pem \
  --output luci-app-adguardhome.apk
```

> 签名只需要私钥；apk 会自己算出公钥并写进包的签名块。

### 3. 把公钥装到路由器

```sh
# 文件名可以随便起，实测 apk 按密钥内容匹配，不按文件名
ssh root@192.168.1.1 'cat > /etc/apk/keys/agh-signing.pem' < public-key.pem
ssh root@192.168.1.1 'chmod 644 /etc/apk/keys/agh-signing.pem'
```

它**不会**覆盖系统自带的 `public-key.pem`，两者并存。

### 4. 验证并安装

```sh
# 在路由器上
apk verify /tmp/luci-app-adguardhome.apk
# 输出：/tmp/...apk: OK

apk add /tmp/luci-app-adguardhome.apk
# 不需要 --allow-untrusted
```

反过来验证一下信任关系（可以自己试）：

```sh
apk verify /tmp/x.apk          # OK
rm /etc/apk/keys/agh-signing.pem
apk verify /tmp/x.apk          # UNTRUSTED signature
```

### 5. 管理信任

```sh
ls /etc/apk/keys/                    # 当前信任了哪些公钥
rm /etc/apk/keys/agh-signing.pem     # 取消信任（只影响之后的安装/校验）
```

---

## 常见问题

**Q：GitHub Release 里的包为什么还要 `--allow-untrusted`？**

那个包是用作者构建树的密钥签的；你的路由器不信任那把钥匙，所以对你来说等同于未签名。
想免解锁就自己重新签一次（方案二）。

**Q：私钥丢了怎么办？**

重新生成一对，把新公钥装进路由器即可；旧包只要旧公钥还在就还能装。不需要“续签”。

**Q：公钥文件名必须叫 `public-key.pem` 吗？**

不用。实测把同一把公钥命名成 `my-signing.pem`、`whatever.pem` 都能验证通过，apk 是
按密钥内容匹配的。

**Q：签名和 `checksums.txt` 有什么区别？**

`checksums.txt` 只防“下载损坏/被替换”，谁都能重新算一份；签名还绑定“是谁打的包”，
并且需要私钥才能生成。两个都建议有。

**Q：能不能让路由器信任官方 OpenWrt 的钥匙？**

官方公钥本来就在 `/etc/apk/keys/` 里，但你没有官方私钥，签不出官方认可的包。

---

## 安全提醒

- 私钥泄露 = 别人可以冒充你签包，进而让信任你的路由器安装任意包；
- 私钥不要进 Git（本仓库 `.gitignore` 已包含 `token.txt`、`.env`，私钥请放在仓库外）；
- 公钥可以公开，装到别人路由器上就是“信任你”；
- 不再需要某把钥匙时，从 `/etc/apk/keys/` 删掉即可。