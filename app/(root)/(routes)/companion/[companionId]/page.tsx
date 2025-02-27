import prismadb from "@/lib/prismadb";
import { CompanionForm } from "./components/companion-form";
import { auth } from "@clerk/nextjs/server";

interface CompanionIdPageProps {
    params: {
        companionId: string;
    };
};

const CompanionIdPage = async ({
    params
}: CompanionIdPageProps) => {
    const { userId } = auth();
    //Check subscription

    if(!userId) {
        return auth().redirectToSignIn();
    }

    const companion = (params.companionId === 'new') ? null : await prismadb.companion.findUnique({
        where: {
            id: params.companionId,
            userId
        }
    });

    const categories = await prismadb.category.findMany();

    return ( 
        <CompanionForm
            initialData={companion}
            categories={categories}
        />
     );
}
 
export default CompanionIdPage;