-- CreateTable
CREATE TABLE "branch_payment_gateway" (
    "id" BIGSERIAL NOT NULL,
    "branch_id" BIGINT NOT NULL,
    "base_url" VARCHAR(255),
    "username" VARCHAR(190),
    "password" VARCHAR(255),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_payment_gateway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_payment_gateway_branch_id_key" ON "branch_payment_gateway"("branch_id");

-- AddForeignKey
ALTER TABLE "branch_payment_gateway" ADD CONSTRAINT "branch_payment_gateway_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
