import { useInfiniteQuery } from '@tanstack/react-query'
import { loadCatalog } from '@/api/photoCatalog'
import {defaultFilters,serializeFilters,type CatalogFilters} from '@/utils/catalogFilters'
export const catalogKey=(userId:number,orderId:number,filters:CatalogFilters=defaultFilters())=>{const signature=serializeFilters(filters);return signature?['photo-catalog',userId,orderId,signature] as const:['photo-catalog',userId,orderId] as const}
export function usePhotoCatalog(userId:number,orderId:number,filters:CatalogFilters=defaultFilters()){
  return useInfiniteQuery({queryKey:catalogKey(userId,orderId,filters),queryFn:({pageParam,signal})=>serializeFilters(filters)?loadCatalog(orderId,pageParam,signal,filters):loadCatalog(orderId,pageParam,signal),initialPageParam:null as string|null,
    getNextPageParam:page=>page.hasMore?page.nextCursor:undefined,enabled:userId>0&&Number.isSafeInteger(orderId)&&orderId>0,staleTime:60000,retry:false,refetchOnWindowFocus:false})
}
