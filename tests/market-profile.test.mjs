import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlatform } from '../scripts/market-profile.mjs';

test('explicit domestic and Amazon platforms route independently of requested language', () => {
  for (const platform of ['淘宝', '天猫', '京东', '拼多多', '抖音', '快手', '小红书', '1688', '微信小店', '天猫国际', '京东国际', '国内电商通用']) {
    for (const locale of ['en-US', 'zh-CN']) assert.equal(resolvePlatform({ platform, locale }).design_profile, 'domestic');
  }
  for (const platform of ['Amazon US', 'amazon.com', '亚马逊']) {
    for (const locale of ['en-US', 'zh-CN']) assert.equal(resolvePlatform({ platform, locale }).design_profile, 'amazon_us');
  }
});

test('no platform is inferred from chat, requested copy language or generic overseas destinations', () => {
  for (const input of [{ locale: 'zh-CN' }, { locale: 'en-US' }, { user_text: '帮我做主图' }]) assert.throws(() => resolvePlatform(input), /上架到哪个平台/);
  for (const platform of ['Temu', 'TikTok Shop', 'Shopee', 'amazon.de']) assert.throws(() => resolvePlatform({ platform }), /尚未支持/);
  assert.throws(() => resolvePlatform({ platform: 'Amazon US', design_profile: 'domestic' }), /conflict/);
  assert.throws(() => resolvePlatform({ platform: '淘宝', marketplace: 'amazon.com' }), /conflict/);
  assert.throws(() => resolvePlatform({ platform: 'Amazon US', marketplace: 'unknown' }), /conflict/);
  assert.equal(resolvePlatform({ marketplace: 'taobao.com' }).marketplace, 'taobao');
  assert.equal(resolvePlatform({ platform: '淘宝', marketplace: 'taobao.com' }).marketplace, 'taobao');
});

test('custom domestic destination needs explicit classification and basis', () => {
  assert.throws(() => resolvePlatform({ platform: '某国内商城', design_profile: 'domestic' }), /尚未支持/);
  const result = resolvePlatform({ platform: '某国内商城', design_profile: 'domestic', platform_basis: 'MOCK user explicitly names domestic storefront' });
  assert.equal(result.platform, '某国内商城');assert.equal(result.design_profile, 'domestic');
  assert.throws(() => resolvePlatform({ platform: 'Temu', design_profile: 'domestic', platform_basis: 'incorrect classification' }), /尚未支持/);
});
