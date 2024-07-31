import { StreamingTextResponse, LangChainStream } from "ai";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConsoleCallbackHandler } from "@langchain/core/tracers/console";
import Replicate from "replicate";
import { NextResponse } from "next/server";

import { MemoryManager } from "@/lib/memory";
import { rateLimit } from "@/lib/rate-limit";
import prismadb from "@/lib/prismadb";
import { CallbackManager } from "@langchain/core/callbacks/manager";

export async function POST(
    request:Request,
    { params }: { params: { chatId: string } }
) {
    try {
        const { prompt } = await request.json();
        const user = await currentUser();

        if(!user || !user.firstName || !user.id) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const identifier = request.url + "-" + user.id;
        const { success } = await rateLimit(identifier);

        if (!success) {
            return new NextResponse("Rate limit exceeded", { status: 429 });
        }

        const companion = await prismadb.companion.update({
            where: {
                id: params.chatId,
            },
            data: {
                messages: {
                    create: {
                        content: prompt,
                        role: "user",
                        userId: user.id,
                    }
                }
            }
        });

        if (!companion) {
            return new NextResponse("Companion not found", { status: 404 });
        }

        const name = companion.id;
        const companion_file_name = name + ".txt";

        const companionKey = {
            companionName: name,
            userId: user.id,
            modelName: "llama2-13b",
        };

        const memoryManager = await MemoryManager.getInstance();

        const records = await memoryManager.readLatestHistory(companionKey);

        if (records.length === 0) {
            await memoryManager.seedChatHistory(companion.seed, "\n\n", companionKey);
        }

        await memoryManager.writeToHistory("User: "+ prompt + "/n", companionKey);

        const recentChatHistory = await memoryManager.readLatestHistory(companionKey);

        const similarDocs = await memoryManager.vectorSearch(
            recentChatHistory,
            companion_file_name,
        );

        let relevantHistory = "";

        if(!!similarDocs && similarDocs.length !== 0) {
            relevantHistory = similarDocs.map((doc) => doc.pageContent).join("\n");
        }

        const { handlers } = LangChainStream();

        const replicate = new Replicate();
        const model = await replicate.predictions.create({
            /*model: "a16z-infra/llama/2-13b-chat:df7690f1994d94e96ad9d568eac121aecf50684a0b0963b25a41cc40061269e5",
            input: {
                max_length: 2048,
            },*/
            model: "meta/llama-2-13b-chat",
            input: {
                max_length: 2048,
            },
            stream: true,
            /*callBackManager: CallbackManager.fromHandlers(handlers),
            apiKey: process.env.REPLICATE_API_TOKEN */
        });

        /* model.verbose = true; */

        /*const resp = String(
            await model
                .call(
                    `
                        ONLY generates plain sentences
                    `
                )
        )

        const cleaned = resp.replaceAll(",","");
        const chunks = cleaned.split("\");
        const response = chunks[0] */
        const response = "";
        await memoryManager.writeToHistory("" + response.trim(), companionKey );
        var Readable = require("stream").Readable;

        let s = new Readable();
        s.push(response);
        s.push(null);

        if(response !== undefined && response.length > 1) {
            memoryManager.writeToHistory("" + response.trim(), companionKey);

            await prismadb.companion.update({
                where: {
                    id: params.chatId,
                },
                data: {
                    messages: {
                        create: {
                            content: response.trim(),
                            role: "system",
                            userId: user.id,
                        }
                    }
                }
            })
        };

        return new StreamingTextResponse(s);

    } catch (error) {
        console.log("[CHAT_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}