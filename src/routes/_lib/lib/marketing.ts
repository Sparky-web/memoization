import { typo } from "~/lib";

// Продукт-агностичные константы публичных страниц: контакты и реквизиты продавца.
// Продавец тот же, что у «Матана» (самозанятый), реквизиты совпадают дословно.

/** E-mail поддержки/продавца. */
export const SUPPORT_EMAIL = "babinovvlad@gmail.com";

/** Публичный сайт сервиса (для юридических документов). */
export const SITE_URL = "https://memoization.studentto.ru";

/** Домен сайта — текст ссылок в документах и футере. */
export const SITE_LABEL = "memoization.studentto.ru";

/** Реквизиты продавца для футера. */
export interface SellerRequisite {
  label: string;
  value: string;
}

export const SELLER_REQUISITES: readonly SellerRequisite[] = [
  { label: typo("Статус"), value: typo("Самозанятый (НПД)") },
  { label: typo("ФИО"), value: typo("Бабинов Владислав Максимович") },
  { label: typo("ИНН"), value: "665802015005" },
];
