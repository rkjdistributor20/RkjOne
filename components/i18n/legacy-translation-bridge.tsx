'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';
import { translateLegacyUiText } from '@/lib/i18n/legacy-ui-text';

const SKIP_SELECTOR = [
 'script',
 'style',
 'noscript',
 'code',
 'pre',
 'svg',
 '[data-rkj-i18n-skip]',
 '[contenteditable="true"]',
].join(',');

const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label'] as const;

function shouldSkipNode(node: Node) {
 const parent = node.parentElement;
 return !parent || Boolean(parent.closest(SKIP_SELECTOR));
}

function translateTextNode(node: Text, locale: 'ms' | 'en', originals: WeakMap<Text, string>) {
 if (shouldSkipNode(node)) return;

 const current = node.nodeValue ?? '';
 if (!originals.has(node)) {
 originals.set(node, current);
 }

 let original = originals.get(node) ?? current;
 const expectedCurrent = translateLegacyUiText(original, locale);
 if (current !== original && current !== expectedCurrent) {
 original = current;
 originals.set(node, current);
 }
 const translated = translateLegacyUiText(original, locale);
 if (node.nodeValue !== translated) {
 node.nodeValue = translated;
 }
}

function translateElementAttrs(element: Element, locale: 'ms' | 'en') {
 if (element.closest(SKIP_SELECTOR)) return;

 for (const attr of TRANSLATED_ATTRS) {
 const current = element.getAttribute(attr);
 if (!current) continue;

 const originalAttr = `data-rkj-original-${attr}`;
 if (!element.hasAttribute(originalAttr)) {
 element.setAttribute(originalAttr, current);
 }

 let original = element.getAttribute(originalAttr) ?? current;
 const expectedCurrent = translateLegacyUiText(original, locale);
 if (current !== original && current !== expectedCurrent) {
 original = current;
 element.setAttribute(originalAttr, current);
 }
 const translated = translateLegacyUiText(original, locale);
 if (current !== translated) {
 element.setAttribute(attr, translated);
 }
 }
}

function translateTree(root: ParentNode, locale: 'ms' | 'en', originals: WeakMap<Text, string>) {
 const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
 let node = walker.nextNode();
 while (node) {
 translateTextNode(node as Text, locale, originals);
 node = walker.nextNode();
 }

 if (root instanceof Element) {
 translateElementAttrs(root, locale);
 }

 const elements = root instanceof Element
 ? root.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]')
 : document.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]');
 elements.forEach((element) => translateElementAttrs(element, locale));
}

export function LegacyTranslationBridge() {
 const { locale } = useLanguage();
 const originalsRef = useRef(new WeakMap<Text, string>());
 const frameRef = useRef<number | null>(null);

 useEffect(() => {
 const scheduleTranslate = (root: ParentNode = document.body) => {
 if (frameRef.current != null) {
 window.cancelAnimationFrame(frameRef.current);
 }
 frameRef.current = window.requestAnimationFrame(() => {
 frameRef.current = null;
 translateTree(root, locale, originalsRef.current);
 });
 };

 scheduleTranslate();

 const observer = new MutationObserver((mutations) => {
 for (const mutation of mutations) {
 if (mutation.type === 'characterData' && mutation.target instanceof Text) {
 translateTextNode(mutation.target, locale, originalsRef.current);
 continue;
 }

 for (const addedNode of Array.from(mutation.addedNodes)) {
 if (addedNode instanceof Text) {
 translateTextNode(addedNode, locale, originalsRef.current);
 } else if (addedNode instanceof Element) {
 scheduleTranslate(addedNode);
 }
 }

 if (
 mutation.type === 'attributes' &&
 mutation.target instanceof Element &&
 typeof mutation.attributeName === 'string'
 ) {
 translateElementAttrs(mutation.target, locale);
 }
 }
 });

 observer.observe(document.body, {
 childList: true,
 subtree: true,
 characterData: true,
 attributes: true,
 attributeFilter: [...TRANSLATED_ATTRS],
 });

 return () => {
 if (frameRef.current != null) {
 window.cancelAnimationFrame(frameRef.current);
 }
 observer.disconnect();
 };
 }, [locale]);

 return null;
}
