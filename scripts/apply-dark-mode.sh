#!/bin/sh
# デザインシステム Phase C: dark: バリアントの機械適用
# 対象: app/ components/ の .tsx（印刷系ディレクトリを除外）
# ガード: 直前が ':' のトークン（hover: dark: 等の複合）は個別ルール以外では触らない

C='(orange|amber|red|green|blue|teal|purple|indigo|pink|yellow|rose|emerald|sky|cyan)'

find app components -name '*.tsx' \
  ! -path 'app/(dashboard)/schedule/print/*' \
  ! -path 'app/(dashboard)/print/*' \
  ! -path 'components/print/*' \
| while read -r f; do
  sed -i -E \
    -e 's#([^:])bg-white([^/a-zA-Z0-9-])#\1bg-white dark:bg-gray-800\2#g' \
    -e 's#([^:])bg-gray-50([^0-9/])#\1bg-gray-50 dark:bg-gray-900/50\2#g' \
    -e 's#([^:])bg-gray-100([^0-9/])#\1bg-gray-100 dark:bg-gray-700\2#g' \
    -e 's#([^:])text-gray-900([^0-9/])#\1text-gray-900 dark:text-gray-100\2#g' \
    -e 's#([^:])text-gray-800([^0-9/])#\1text-gray-800 dark:text-gray-100\2#g' \
    -e 's#([^:])text-gray-700([^0-9/])#\1text-gray-700 dark:text-gray-300\2#g' \
    -e 's#([^:])text-gray-600([^0-9/])#\1text-gray-600 dark:text-gray-300\2#g' \
    -e 's#([^:])text-gray-500([^0-9/])#\1text-gray-500 dark:text-gray-400\2#g' \
    -e 's#([^:])border-gray-100([^0-9/])#\1border-gray-100 dark:border-gray-700\2#g' \
    -e 's#([^:])border-gray-200([^0-9/])#\1border-gray-200 dark:border-gray-700\2#g' \
    -e 's#([^:])border-gray-300([^0-9/])#\1border-gray-300 dark:border-gray-600\2#g' \
    -e 's#([^:])divide-gray-50([^0-9/])#\1divide-gray-50 dark:divide-gray-700\2#g' \
    -e 's#([^:])divide-gray-100([^0-9/])#\1divide-gray-100 dark:divide-gray-700\2#g' \
    -e 's#([^:])text-navy([^-a-zA-Z0-9])#\1text-navy dark:text-blue-300\2#g' \
    -e 's#([^:])hover:bg-gray-50([^0-9/])#\1hover:bg-gray-50 dark:hover:bg-gray-700/50\2#g' \
    -e 's#([^:])hover:bg-gray-100([^0-9/])#\1hover:bg-gray-100 dark:hover:bg-gray-700\2#g' \
    -e "s#([^:])bg-$C-50([^0-9/])#\\1bg-\\2-50 dark:bg-\\2-950/40\\3#g" \
    -e "s#([^:])bg-$C-100([^0-9/])#\\1bg-\\2-100 dark:bg-\\2-900/60\\3#g" \
    -e "s#([^:])border-$C-200([^0-9/])#\\1border-\\2-200 dark:border-\\2-900\\3#g" \
    -e "s#([^:])border-$C-300([^0-9/])#\\1border-\\2-300 dark:border-\\2-800\\3#g" \
    -e "s#([^:])text-$C-800([^0-9/])#\\1text-\\2-800 dark:text-\\2-200\\3#g" \
    -e "s#([^:])text-$C-700([^0-9/])#\\1text-\\2-700 dark:text-\\2-300\\3#g" \
    -e "s#([^:])text-$C-600([^0-9/])#\\1text-\\2-600 dark:text-\\2-300\\3#g" \
    "$f"
done
echo DONE
