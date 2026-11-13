import { queryOptions } from "@tanstack/react-query";
import { getBackups, getChannels, getChannelWithSources, getHomeMatches, getMatchWithSources } from "./public-data.functions";

export const homeMatchesQuery = () =>
  queryOptions({ queryKey: ["matches", "home"], queryFn: () => getHomeMatches(), staleTime: 15_000 });

export const matchQuery = (id: string) =>
  queryOptions({ queryKey: ["matches", "detail", id], queryFn: () => getMatchWithSources({ data: { id } }), staleTime: 15_000 });

export const channelsQuery = () => queryOptions({ queryKey: ["channels"], queryFn: () => getChannels(), staleTime: 60_000 });

export const channelQuery = (id: string) =>
  queryOptions({ queryKey: ["channels", "detail", id], queryFn: () => getChannelWithSources({ data: { id } }), staleTime: 60_000 });

export const backupsQuery = () => queryOptions({ queryKey: ["backups"], queryFn: () => getBackups(), staleTime: 30_000 });
