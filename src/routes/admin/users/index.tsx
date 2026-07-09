import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Heading, Input, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { adminQueries, AdminUserCard, ListSkeleton, LoadMoreSentinel } from "../_lib";

export const Route = createFileRoute("/admin/users/")({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(adminQueries.users("")),
  head: () => ({ meta: [{ title: typo("Пользователи — админка") }] }),
  component: AdminUsersPage,
});

const SEARCH_DEBOUNCE_MS = 300;

function AdminUsersPage() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  // Дебаунс без useEffect: таймер живёт в ref и перезаводится в обработчике ввода.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usersQuery = useInfiniteQuery(adminQueries.users(query));

  const handleSearchChange = (value: string) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const users = (usersQuery.data?.pages ?? []).flatMap((page) => page.users);

  function renderList() {
    if (usersQuery.isLoading) {
      return <ListSkeleton />;
    }
    if (!users.length) {
      return <Text color="supplementary">{typo("Никого не нашли")}</Text>;
    }
    return (
      <VStack gap="sm">
        {users.map((user) => (
          <AdminUserCard key={user.id} user={user} />
        ))}
        {usersQuery.isFetchingNextPage && <ListSkeleton rows={1} />}
        {usersQuery.hasNextPage && (
          <LoadMoreSentinel
            onVisible={() => {
              if (usersQuery.hasNextPage && !usersQuery.isFetchingNextPage) void usersQuery.fetchNextPage();
            }}
          />
        )}
      </VStack>
    );
  }

  return (
    <VStack gap="xl">
      <Heading variant="h2">{typo("Пользователи")}</Heading>

      <Input
        value={text}
        placeholder={typo("Поиск по email или имени")}
        onChange={(event) => {
          handleSearchChange(event.target.value);
        }}
      />

      {renderList()}
    </VStack>
  );
}
