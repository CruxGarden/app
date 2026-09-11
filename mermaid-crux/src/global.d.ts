/// <reference types="@sveltejs/kit" />
interface Window {
  gardenReady?: Promise<{
    driver: {getItem(key:string):string|null;setItem(key:string,value:string):void};
    connect(api:{inspect():unknown;command(value:Record<string,unknown>):Promise<unknown>}):void;
  } | null>;
}
